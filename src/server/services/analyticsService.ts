import type {
  AnomalyRecord,
  AnomalyReport,
  CongestionForecast,
  CongestionLevel,
  IoePillarStatus,
  IoeSystemOverview,
  RevenueAnalytics,
  RevenueByDay,
  RevenueByStation,
  StationCongestion,
} from "../../shared/types";
import { getDb } from "../db";
import { countUnreadAdminNotifications } from "./notificationService";
import { countOpenMaintenanceTickets } from "./maintenanceService";

/**
 * Analytics / insights service.
 *
 * This is the IoE "Data" pillar. All figures are derived on demand from the
 * existing trips, transactions, wallets, and station tables — no separate data
 * warehouse — covering revenue analysis, congestion (crowd-density) prediction,
 * and anomaly detection.
 */

const CONGESTION_WINDOW_MINUTES = 60;
const STALE_TRIP_HOURS = 3;
const RAPID_TAP_WINDOW_MINUTES = 5;
const RAPID_TAP_THRESHOLD = 4;
const MAX_EXPECTED_FARE = 50;
const DEVICE_SILENCE_HOURS = 24;

const IOE_SYSTEM_NAME = "IOE_TRANSIT_CORE";
const IOE_VERSION = "5.0.0";

function nowIso(): string {
  return new Date().toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Revenue analysis
// ---------------------------------------------------------------------------

export function getRevenueAnalytics(): RevenueAnalytics {
  const db = getDb();

  const totals = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(ABS(amount)), 0) AS revenue,
          COUNT(*) AS trips
        FROM transactions
        WHERE type = 'FARE_DEDUCTION'
      `,
    )
    .get() as { revenue: number; trips: number };

  const totalRevenue = round(Number(totals.revenue || 0));
  const totalTrips = Number(totals.trips || 0);
  const averageFare = totalTrips > 0 ? round(totalRevenue / totalTrips) : 0;

  const dailyRows = db
    .prepare(
      `
        SELECT
          date(created_at) AS date,
          COALESCE(SUM(ABS(amount)), 0) AS revenue,
          COUNT(*) AS trips
        FROM transactions
        WHERE type = 'FARE_DEDUCTION'
          AND created_at >= ?
        GROUP BY date(created_at)
        ORDER BY date(created_at) ASC
      `,
    )
    .all(isoHoursAgo(24 * 7)) as Array<{ date: string; revenue: number; trips: number }>;

  const last7Days: RevenueByDay[] = dailyRows.map((row) => ({
    date: row.date,
    revenue: round(Number(row.revenue || 0)),
    trips: Number(row.trips || 0),
  }));

  const stationRows = db
    .prepare(
      `
        SELECT
          stations.id AS station_id,
          stations.code AS station_code,
          stations.name AS station_name,
          COALESCE(SUM(ABS(transactions.amount)), 0) AS revenue,
          COUNT(transactions.id) AS taps
        FROM trips
        INNER JOIN stations ON stations.id = trips.exit_station_id
        LEFT JOIN transactions
          ON transactions.reference_id = 'trip:' || trips.id
          AND transactions.type = 'FARE_DEDUCTION'
        WHERE trips.status = 'COMPLETED'
        GROUP BY stations.id
        ORDER BY revenue DESC
        LIMIT 5
      `,
    )
    .all() as Array<{
    station_id: number;
    station_code: string;
    station_name: string;
    revenue: number;
    taps: number;
  }>;

  const topStations: RevenueByStation[] = stationRows.map((row) => ({
    stationId: Number(row.station_id),
    stationCode: row.station_code,
    stationName: row.station_name,
    revenue: round(Number(row.revenue || 0)),
    taps: Number(row.taps || 0),
  }));

  return { totalRevenue, totalTrips, averageFare, last7Days, topStations };
}

// ---------------------------------------------------------------------------
// Congestion / crowd-density prediction
// ---------------------------------------------------------------------------

function classifyCongestion(predicted: number): CongestionLevel {
  if (predicted <= 2) return "LOW";
  if (predicted <= 5) return "MODERATE";
  if (predicted <= 10) return "HIGH";
  return "SEVERE";
}

export function getCongestionForecast(): CongestionForecast {
  const db = getDb();
  const windowCutoff = isoMinutesAgo(CONGESTION_WINDOW_MINUTES);

  const stations = db
    .prepare(
      `
        SELECT id, code, name, zone
        FROM stations
        ORDER BY id ASC
      `,
    )
    .all() as Array<{ id: number; code: string; name: string; zone: number }>;

  const activeRows = db
    .prepare(
      `
        SELECT entry_station_id AS station_id, COUNT(*) AS count
        FROM trips
        WHERE status = 'IN_TRANSIT'
        GROUP BY entry_station_id
      `,
    )
    .all() as Array<{ station_id: number; count: number }>;
  const activeByStation = new Map(activeRows.map((row) => [Number(row.station_id), Number(row.count)]));

  const recentRows = db
    .prepare(
      `
        SELECT entry_station_id AS station_id, COUNT(*) AS count
        FROM trips
        WHERE entry_time >= ?
        GROUP BY entry_station_id
      `,
    )
    .all(windowCutoff) as Array<{ station_id: number; count: number }>;
  const recentByStation = new Map(recentRows.map((row) => [Number(row.station_id), Number(row.count)]));

  const historyRows = db
    .prepare(
      `
        SELECT entry_station_id AS station_id, COUNT(*) AS count, MIN(entry_time) AS first_entry
        FROM trips
        GROUP BY entry_station_id
      `,
    )
    .all() as Array<{ station_id: number; count: number; first_entry: string | null }>;
  const historyByStation = new Map(
    historyRows.map((row) => [Number(row.station_id), row]),
  );

  const now = Date.now();

  const stationForecasts: StationCongestion[] = stations.map((station) => {
    const recentTaps = recentByStation.get(station.id) ?? 0;
    const activeTrips = activeByStation.get(station.id) ?? 0;
    const history = historyByStation.get(station.id);

    let historicalHourlyAvg = 0;
    if (history && history.first_entry) {
      const spanHours = Math.max(1, (now - new Date(history.first_entry).getTime()) / 3_600_000);
      historicalHourlyAvg = Number(history.count) / spanHours;
    }

    // Blend the most recent window with the long-run hourly average.
    const predictedNextHourTaps = Math.max(
      0,
      Math.round(0.6 * recentTaps + 0.4 * historicalHourlyAvg),
    );

    return {
      stationId: station.id,
      stationCode: station.code,
      stationName: station.name,
      zone: station.zone,
      activeTrips,
      recentTaps,
      predictedNextHourTaps,
      congestionLevel: classifyCongestion(predictedNextHourTaps),
    };
  });

  const peakPredicted = stationForecasts.reduce(
    (max, station) => Math.max(max, station.predictedNextHourTaps),
    0,
  );

  return {
    generatedAt: nowIso(),
    windowMinutes: CONGESTION_WINDOW_MINUTES,
    networkLoad: classifyCongestion(peakPredicted),
    stations: stationForecasts,
  };
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

export interface SilentStation {
  stationId: number;
  stationCode: string;
  stationName: string;
  deviceId: string | null;
  lastSeen: string | null;
}

/**
 * Stations that have historical trip activity but have gone quiet for longer
 * than the silence window — a proxy for an offline gate/sensor. Exposed for the
 * scheduled task runner so it can raise maintenance tickets.
 */
export function getSilentStations(): SilentStation[] {
  const db = getDb();
  const cutoff = isoHoursAgo(DEVICE_SILENCE_HOURS);

  const rows = db
    .prepare(
      `
        SELECT
          stations.id AS station_id,
          stations.code AS station_code,
          stations.name AS station_name,
          MAX(trips.entry_time) AS last_seen,
          (
            SELECT device_id FROM hardware_devices
            WHERE hardware_devices.station_id = stations.id
            ORDER BY hardware_devices.id ASC
            LIMIT 1
          ) AS device_id
        FROM stations
        INNER JOIN trips ON trips.entry_station_id = stations.id
        GROUP BY stations.id
        HAVING MAX(trips.entry_time) < ?
      `,
    )
    .all(cutoff) as Array<{
    station_id: number;
    station_code: string;
    station_name: string;
    last_seen: string | null;
    device_id: string | null;
  }>;

  return rows.map((row) => ({
    stationId: Number(row.station_id),
    stationCode: row.station_code,
    stationName: row.station_name,
    deviceId: row.device_id ?? null,
    lastSeen: row.last_seen ?? null,
  }));
}

export function getAnomalyReport(): AnomalyReport {
  const db = getDb();
  const detectedAt = nowIso();
  const anomalies: AnomalyRecord[] = [];

  const staleTrips = db
    .prepare(
      `
        SELECT trips.id AS trip_id, users.gov_id AS gov_id, trips.entry_time AS entry_time
        FROM trips
        INNER JOIN users ON users.id = trips.user_id
        WHERE trips.status = 'IN_TRANSIT' AND trips.entry_time < ?
        ORDER BY trips.entry_time ASC
      `,
    )
    .all(isoHoursAgo(STALE_TRIP_HOURS)) as Array<{ trip_id: number; gov_id: string; entry_time: string }>;

  for (const trip of staleTrips) {
    anomalies.push({
      type: "STALE_TRIP",
      severity: "WARNING",
      message: `Trip #${trip.trip_id} for ${trip.gov_id} has been in transit since ${trip.entry_time} without a check-out.`,
      reference: `trip:${trip.trip_id}`,
      detectedAt,
    });
  }

  const negativeWallets = db
    .prepare(
      `
        SELECT wallets.user_id AS user_id, users.gov_id AS gov_id, wallets.balance AS balance
        FROM wallets
        INNER JOIN users ON users.id = wallets.user_id
        WHERE wallets.balance < 0
      `,
    )
    .all() as Array<{ user_id: number; gov_id: string; balance: number }>;

  for (const wallet of negativeWallets) {
    anomalies.push({
      type: "NEGATIVE_BALANCE",
      severity: "CRITICAL",
      message: `Wallet for ${wallet.gov_id} holds a negative balance of ${round(wallet.balance)}.`,
      reference: `user:${wallet.user_id}`,
      detectedAt,
    });
  }

  const rapidTaps = db
    .prepare(
      `
        SELECT trips.user_id AS user_id, users.gov_id AS gov_id, COUNT(*) AS count
        FROM trips
        INNER JOIN users ON users.id = trips.user_id
        WHERE trips.entry_time >= ?
        GROUP BY trips.user_id
        HAVING COUNT(*) >= ?
      `,
    )
    .all(isoMinutesAgo(RAPID_TAP_WINDOW_MINUTES), RAPID_TAP_THRESHOLD) as Array<{
    user_id: number;
    gov_id: string;
    count: number;
  }>;

  for (const tap of rapidTaps) {
    anomalies.push({
      type: "RAPID_TAPS",
      severity: "WARNING",
      message: `${tap.gov_id} started ${tap.count} trips in the last ${RAPID_TAP_WINDOW_MINUTES} minutes.`,
      reference: `user:${tap.user_id}`,
      detectedAt,
    });
  }

  const fareSpikes = db
    .prepare(
      `
        SELECT transactions.id AS transaction_id, users.gov_id AS gov_id, ABS(transactions.amount) AS amount
        FROM transactions
        INNER JOIN users ON users.id = transactions.user_id
        WHERE transactions.type = 'FARE_DEDUCTION' AND ABS(transactions.amount) > ?
        ORDER BY amount DESC
        LIMIT 10
      `,
    )
    .all(MAX_EXPECTED_FARE) as Array<{ transaction_id: number; gov_id: string; amount: number }>;

  for (const spike of fareSpikes) {
    anomalies.push({
      type: "FARE_SPIKE",
      severity: "WARNING",
      message: `Fare of ${round(spike.amount)} charged to ${spike.gov_id} exceeds the maximum expected fare of ${MAX_EXPECTED_FARE}.`,
      reference: `transaction:${spike.transaction_id}`,
      detectedAt,
    });
  }

  for (const station of getSilentStations()) {
    anomalies.push({
      type: "DEVICE_SILENT",
      severity: "WARNING",
      message: `${station.stationName} (${station.stationCode}) has recorded no taps for over ${DEVICE_SILENCE_HOURS} hours. Last seen ${station.lastSeen ?? "never"}.`,
      reference: station.deviceId ? `device:${station.deviceId}` : `station:${station.stationId}`,
      detectedAt,
    });
  }

  return { generatedAt: detectedAt, anomalies };
}

// ---------------------------------------------------------------------------
// IoE system overview (People / Process / Data / Things)
// ---------------------------------------------------------------------------

export function getIoeSystemOverview(): IoeSystemOverview {
  const db = getDb();
  const revenue = getRevenueAnalytics();
  const congestion = getCongestionForecast();
  const anomalies = getAnomalyReport();
  const openMaintenanceTickets = countOpenMaintenanceTickets();
  const unreadAdminNotifications = countUnreadAdminNotifications();

  const activeUsers = (
    db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'USER' AND status = 'ACTIVE'")
      .get() as { count: number }
  ).count;

  const guardianCount = (
    db.prepare("SELECT COUNT(*) AS count FROM guardians").get() as { count: number }
  ).count;

  const deviceCount = (
    db.prepare("SELECT COUNT(*) AS count FROM hardware_devices").get() as { count: number }
  ).count;

  const criticalAnomalies = anomalies.anomalies.filter(
    (anomaly) => anomaly.severity === "CRITICAL",
  ).length;
  const deviceAnomalies = anomalies.anomalies.filter(
    (anomaly) => anomaly.type === "DEVICE_SILENT",
  ).length;

  const pillars: IoePillarStatus[] = [
    {
      pillar: "PEOPLE",
      label: "People",
      healthy: true,
      metric: activeUsers,
      detail: `${activeUsers} active passengers, ${guardianCount} guardian links`,
    },
    {
      pillar: "PROCESS",
      label: "Process",
      healthy: openMaintenanceTickets === 0,
      metric: openMaintenanceTickets,
      detail: `${openMaintenanceTickets} open maintenance tickets, ${unreadAdminNotifications} unread admin alerts`,
    },
    {
      pillar: "DATA",
      label: "Data",
      healthy: criticalAnomalies === 0,
      metric: revenue.totalTrips,
      detail: `${revenue.totalTrips} trips analysed, avg fare ${revenue.averageFare}, ${anomalies.anomalies.length} anomalies`,
    },
    {
      pillar: "THINGS",
      label: "Things",
      healthy: deviceAnomalies === 0,
      metric: deviceCount,
      detail: `${deviceCount} registered gate devices, ${deviceAnomalies} silent`,
    },
  ];

  return {
    system: IOE_SYSTEM_NAME,
    version: IOE_VERSION,
    generatedAt: nowIso(),
    pillars,
    revenue,
    congestion,
    anomalies,
    openMaintenanceTickets,
    unreadAdminNotifications,
  };
}

export const IOE_METADATA = {
  system: IOE_SYSTEM_NAME,
  version: IOE_VERSION,
};
