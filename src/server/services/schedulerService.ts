import { getDb } from "../db";
import { getAnomalyReport, getSilentStations } from "./analyticsService";
import {
  createNotification,
  dispatchGuardianAlert,
  notifyAdmins,
} from "./notificationService";
import { createMaintenanceTicket, findActiveTicket } from "./maintenanceService";

/**
 * Scheduled system task runner.
 *
 * The IoE "Process automation" layer: a lightweight in-process scheduler that
 * periodically sweeps the system for low balances, anomalies, and silent gate
 * devices, then emits notifications, guardian alerts, and maintenance tickets.
 *
 * It is deliberately dependency-free (a single interval) so it runs anywhere the
 * Express server runs. In a clustered/cloud deployment this would be replaced by
 * a durable queue or cron worker, but the task logic below stays the same.
 */

const DEFAULT_INTERVAL_MS = 60_000;
const RESEND_COOLDOWN_MS = 60 * 60 * 1000; // do not re-alert the same condition within an hour
const DEFAULT_LOW_BALANCE_THRESHOLD = 50;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// Remembers the last time a given condition was alerted, so repeated sweeps do
// not spam the same passenger, guardian, or admin.
const lastAlertedAt = new Map<string, number>();

function withinCooldown(key: string): boolean {
  const last = lastAlertedAt.get(key);
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
    return true;
  }
  lastAlertedAt.set(key, Date.now());
  return false;
}

function lowBalanceThreshold(): number {
  const configured = Number(process.env.LOW_BALANCE_THRESHOLD);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_LOW_BALANCE_THRESHOLD;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sweepLowBalances(): void {
  const db = getDb();
  const threshold = lowBalanceThreshold();

  const rows = db
    .prepare(
      `
        SELECT users.id AS user_id, users.gov_id AS gov_id, wallets.balance AS balance
        FROM users
        INNER JOIN wallets ON wallets.user_id = users.id
        WHERE users.role = 'USER' AND users.status = 'ACTIVE' AND wallets.balance < ?
      `,
    )
    .all(threshold) as Array<{ user_id: number; gov_id: string; balance: number }>;

  for (const row of rows) {
    const balance = round(Number(row.balance));

    if (!withinCooldown(`low-balance:user:${row.user_id}`)) {
      createNotification({
        userId: Number(row.user_id),
        category: "WALLET",
        severity: balance <= 0 ? "CRITICAL" : "WARNING",
        title: "Low wallet balance",
        body: `Your wallet balance is ₹${balance}. Please recharge to avoid being blocked at the gate.`,
        metadata: { balance, threshold },
      });
    }

    // Guardian escalation: alert guardians whose own threshold is breached.
    const guardianRows = db
      .prepare(
        `
          SELECT id, low_balance_threshold
          FROM guardians
          WHERE user_id = ? AND notify_on_low_balance = 1 AND low_balance_threshold >= ?
        `,
      )
      .all(row.user_id, balance) as Array<{ id: number; low_balance_threshold: number }>;

    if (guardianRows.length && !withinCooldown(`low-balance-guardian:user:${row.user_id}`)) {
      dispatchGuardianAlert({
        userId: Number(row.user_id),
        trigger: "LOW_BALANCE",
        severity: balance <= 0 ? "CRITICAL" : "WARNING",
        title: "Guardian alert: low balance",
        body: `${row.gov_id} has a low wallet balance of ₹${balance}.`,
        metadata: { balance, threshold },
      });
    }
  }
}

function sweepAnomalies(): void {
  const report = getAnomalyReport();

  for (const anomaly of report.anomalies) {
    const key = `anomaly:${anomaly.type}:${anomaly.reference ?? "n/a"}`;
    if (withinCooldown(key)) {
      continue;
    }

    notifyAdmins({
      category: anomaly.type === "DEVICE_SILENT" ? "MAINTENANCE" : "SECURITY",
      severity: anomaly.severity,
      title: `Anomaly detected: ${anomaly.type.replace(/_/g, " ").toLowerCase()}`,
      body: anomaly.message,
      metadata: { anomalyType: anomaly.type, reference: anomaly.reference },
    });
  }
}

function sweepSilentDevices(): void {
  for (const station of getSilentStations()) {
    // Deduplicate against any active ticket for the same device.
    if (findActiveTicket(station.deviceId, "NETWORK")) {
      continue;
    }

    createMaintenanceTicket({
      title: `${station.stationName} gate unresponsive`,
      description: `No taps recorded at ${station.stationName} (${station.stationCode}) for over 24 hours. Last seen ${station.lastSeen ?? "never"}. Inspect the gate controller and network link.`,
      deviceId: station.deviceId,
      category: "NETWORK",
      severity: "HIGH",
      source: "AUTO",
    });
  }
}

export interface ScheduledTaskResult {
  ranAt: string;
  ok: boolean;
  errors: string[];
}

export function runScheduledTasksOnce(): ScheduledTaskResult {
  const errors: string[] = [];
  const tasks: Array<[string, () => void]> = [
    ["lowBalances", sweepLowBalances],
    ["anomalies", sweepAnomalies],
    ["silentDevices", sweepSilentDevices],
  ];

  for (const [name, task] of tasks) {
    try {
      task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${name}: ${message}`);
      console.error(`[scheduler] task "${name}" failed:`, message);
    }
  }

  return { ranAt: new Date().toISOString(), ok: errors.length === 0, errors };
}

export function startScheduler(): void {
  if (process.env.SCHEDULER_ENABLED === "false") {
    console.log("[scheduler] disabled via SCHEDULER_ENABLED=false");
    return;
  }

  if (intervalHandle) {
    return;
  }

  const configured = Number(process.env.SCHEDULER_INTERVAL_MS);
  const intervalMs = Number.isFinite(configured) && configured >= 5_000 ? configured : DEFAULT_INTERVAL_MS;

  const tick = () => {
    if (isRunning) {
      return;
    }
    isRunning = true;
    try {
      runScheduledTasksOnce();
    } finally {
      isRunning = false;
    }
  };

  // Kick off shortly after boot, then on the configured cadence.
  setTimeout(tick, 5_000).unref?.();
  intervalHandle = setInterval(tick, intervalMs);
  intervalHandle.unref?.();

  console.log(`[scheduler] scheduled tasks running every ${intervalMs}ms`);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
