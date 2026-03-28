import { Router } from "express";
import {
  TRANSACTION_SELECT,
  TRIP_SELECT,
  USER_SELECT,
  WALLET_SELECT,
  getDb,
  mapTripRow,
  mapUserRow,
  mapWalletRow,
  mapTransactionRow,
} from "../db";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { calculateFare } from "../services/fareCalculator";
import type { PaginatedResponse, Trip, TripStatus } from "../../shared/types";

export const tripsRouter = Router();

function getPagination(query: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function parseTripFilters(query: Record<string, unknown>) {
  const filters: string[] = [];
  const params: Array<string | number> = [];
  const stationId = Number(query.stationId);
  const from = typeof query.from === "string" ? query.from.trim() : "";
  const to = typeof query.to === "string" ? query.to.trim() : "";
  const status = typeof query.status === "string" ? query.status.trim().toUpperCase() : "";

  if (Number.isInteger(stationId) && stationId > 0) {
    filters.push("(trips.entry_station_id = ? OR trips.exit_station_id = ?)");
    params.push(stationId, stationId);
  }

  if (from) {
    filters.push("date(trips.entry_time) >= date(?)");
    params.push(from);
  }

  if (to) {
    filters.push("date(trips.entry_time) <= date(?)");
    params.push(to);
  }

  if (status === "IN_TRANSIT" || status === "COMPLETED") {
    filters.push("trips.status = ?");
    params.push(status as TripStatus);
  }

  return { filters, params };
}

tripsRouter.use(authenticateToken);

tripsRouter.post("/entry", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const stationId = Number(req.body?.stationId);

  if (!Number.isInteger(stationId) || stationId <= 0) {
    res.status(400).json({ message: "A valid entry station is required." });
    return;
  }

  const userRow = db
    .prepare(
      `
        SELECT ${USER_SELECT}
        FROM users
        WHERE users.id = ?
      `,
    )
    .get(req.auth!.userId) as Record<string, unknown> | undefined;

  if (!userRow) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const user = mapUserRow(userRow);

  if (user.status !== "ACTIVE") {
    res.status(403).json({ message: "Only active users can start trips." });
    return;
  }

  const activeTrip = db
    .prepare(
      `
        SELECT trips.id
        FROM trips
        WHERE trips.user_id = ? AND trips.status = 'IN_TRANSIT'
      `,
    )
    .get(req.auth!.userId) as { id: number } | undefined;

  if (activeTrip) {
    res.status(409).json({ message: "User already has an active trip." });
    return;
  }

  const stationExists = db
    .prepare("SELECT id FROM stations WHERE id = ?")
    .get(stationId) as { id: number } | undefined;

  if (!stationExists) {
    res.status(404).json({ message: "Entry station not found." });
    return;
  }

  const entryTime = new Date().toISOString();
  const tripId = Number(
    db
      .prepare(
        `
          INSERT INTO trips (user_id, entry_station_id, entry_time, status)
          VALUES (?, ?, ?, ?)
        `,
      )
      .run(req.auth!.userId, stationId, entryTime, "IN_TRANSIT").lastInsertRowid,
  );

  const tripRow = db
    .prepare(
      `
        SELECT ${TRIP_SELECT}
        FROM trips
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        WHERE trips.id = ?
      `,
    )
    .get(tripId) as Record<string, unknown>;

  res.status(201).json({ trip: mapTripRow(tripRow) });
});

tripsRouter.post("/exit", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const stationId = Number(req.body?.stationId);

  if (!Number.isInteger(stationId) || stationId <= 0) {
    res.status(400).json({ message: "A valid exit station is required." });
    return;
  }

  const activeTripRow = db
    .prepare(
      `
        SELECT ${TRIP_SELECT}
        FROM trips
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        WHERE trips.user_id = ? AND trips.status = 'IN_TRANSIT'
      `,
    )
    .get(req.auth!.userId) as Record<string, unknown> | undefined;

  if (!activeTripRow) {
    res.status(404).json({ message: "No active trip found." });
    return;
  }

  const activeTrip = mapTripRow(activeTripRow);
  const exitStationRow = db
    .prepare(
      `
        SELECT
          stations.id AS exit_station_id,
          stations.code AS exit_station_code,
          stations.name AS exit_station_name,
          stations.zone AS exit_station_zone
        FROM stations
        WHERE stations.id = ?
      `,
    )
    .get(stationId) as Record<string, unknown> | undefined;

  if (!exitStationRow) {
    res.status(404).json({ message: "Exit station not found." });
    return;
  }

  const exitStation = {
    id: Number(exitStationRow.exit_station_id),
    code: String(exitStationRow.exit_station_code),
    name: String(exitStationRow.exit_station_name),
    zone: Number(exitStationRow.exit_station_zone),
  };
  const fare = Number(calculateFare(activeTrip.entryStation, exitStation).toFixed(2));

  const walletRow = db
    .prepare(
      `
        SELECT ${WALLET_SELECT}
        FROM wallets
        WHERE wallets.user_id = ?
      `,
    )
    .get(req.auth!.userId) as Record<string, unknown> | undefined;

  if (!walletRow) {
    res.status(404).json({ message: "Wallet not found." });
    return;
  }

  const wallet = mapWalletRow(walletRow);

  if (wallet.balance < fare) {
    res.status(400).json({ message: "Insufficient wallet balance for fare deduction." });
    return;
  }

  const completeTripTransaction = db.transaction(() => {
    const completedAt = new Date().toISOString();
    const nextBalance = Number((wallet.balance - fare).toFixed(2));

    db.prepare(
      `
        UPDATE trips
        SET exit_station_id = ?, exit_time = ?, fare = ?, status = 'COMPLETED'
        WHERE id = ?
      `,
    ).run(stationId, completedAt, fare, activeTrip.id);

    db.prepare(
      `
        UPDATE wallets
        SET balance = ?, updated_at = ?
        WHERE user_id = ?
      `,
    ).run(nextBalance, completedAt, req.auth!.userId);

    const transactionResult = db
      .prepare(
        `
          INSERT INTO transactions (user_id, type, amount, reference_id, balance_after, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        req.auth!.userId,
        "FARE_DEDUCTION",
        -fare,
        `trip:${activeTrip.id}`,
        nextBalance,
        `${activeTrip.entryStation.name} to ${exitStation.name}`,
        completedAt,
      );

    const tripRow = db
      .prepare(
        `
          SELECT ${TRIP_SELECT}
          FROM trips
          INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
          LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
          WHERE trips.id = ?
        `,
      )
      .get(activeTrip.id) as Record<string, unknown>;

    const updatedWalletRow = db
      .prepare(
        `
          SELECT ${WALLET_SELECT}
          FROM wallets
          WHERE wallets.user_id = ?
        `,
      )
      .get(req.auth!.userId) as Record<string, unknown>;

    const transactionRow = db
      .prepare(
        `
          SELECT ${TRANSACTION_SELECT}
          FROM transactions
          WHERE transactions.id = ?
        `,
      )
      .get(Number(transactionResult.lastInsertRowid)) as Record<string, unknown>;

    return {
      trip: mapTripRow(tripRow),
      wallet: mapWalletRow(updatedWalletRow),
      transaction: mapTransactionRow(transactionRow),
      fare,
    };
  });

  res.json(completeTripTransaction());
});

tripsRouter.get("/", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { page, pageSize, offset } = getPagination(req.query as Record<string, unknown>);
  const { filters, params } = parseTripFilters(req.query as Record<string, unknown>);
  const allFilters = ["trips.user_id = ?", ...filters];
  const queryParams = [req.auth!.userId, ...params];
  const whereClause = `WHERE ${allFilters.join(" AND ")}`;

  const totalRow = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM trips
        ${whereClause}
      `,
    )
    .get(...queryParams) as { total: number };

  const rows = db
    .prepare(
      `
        SELECT ${TRIP_SELECT}
        FROM trips
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        ${whereClause}
        ORDER BY trips.entry_time DESC, trips.id DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(...queryParams, pageSize, offset) as Record<string, unknown>[];

  const data = rows.map((row) => mapTripRow(row));
  const payload: PaginatedResponse<Trip> = {
    data,
    page,
    pageSize,
    total: totalRow.total,
    totalPages: Math.max(1, Math.ceil(totalRow.total / pageSize)),
  };

  res.json(payload);
});

tripsRouter.get("/active", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT ${TRIP_SELECT}
        FROM trips
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        WHERE trips.user_id = ? AND trips.status = 'IN_TRANSIT'
      `,
    )
    .get(req.auth!.userId) as Record<string, unknown> | undefined;

  res.json({
    trip: row ? mapTripRow(row) : null,
  });
});
