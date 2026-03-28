import { Router } from "express";
import { TRIP_SELECT, USER_SELECT, getDb, mapTripLogRow } from "../db";
import { authenticateToken, requireAdmin } from "../middleware/auth";
import type { PaginatedResponse, TripLog, TripStatus } from "../../shared/types";

export const adminRouter = Router();

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

adminRouter.use(authenticateToken, requireAdmin);

adminRouter.get("/stats", (_req, res) => {
  const db = getDb();
  const activeTrips = db
    .prepare("SELECT COUNT(*) AS count FROM trips WHERE status = 'IN_TRANSIT'")
    .get() as { count: number };
  const revenue = db
    .prepare(
      `
        SELECT COALESCE(SUM(ABS(amount)), 0) AS value
        FROM transactions
        WHERE type = 'FARE_DEDUCTION'
      `,
    )
    .get() as { value: number };
  const passengerCount = db
    .prepare("SELECT COUNT(DISTINCT user_id) AS count FROM trips")
    .get() as { count: number };
  const activeUsers = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'USER' AND status = 'ACTIVE'")
    .get() as { count: number };
  const totalUsers = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'USER'")
    .get() as { count: number };

  res.json({
    activeTrips: activeTrips.count,
    revenue: Number(revenue.value || 0),
    passengerCount: passengerCount.count,
    activeUsers: activeUsers.count,
    totalUsers: totalUsers.count,
  });
});

adminRouter.get("/trips", (req, res) => {
  const db = getDb();
  const { page, pageSize, offset } = getPagination(req.query as Record<string, unknown>);
  const { filters, params } = parseTripFilters(req.query as Record<string, unknown>);
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const totalRow = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM trips
        ${whereClause}
      `,
    )
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `
        SELECT
          ${TRIP_SELECT},
          ${USER_SELECT}
        FROM trips
        INNER JOIN users ON users.id = trips.user_id
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        ${whereClause}
        ORDER BY trips.entry_time DESC, trips.id DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(...params, pageSize, offset) as Record<string, unknown>[];

  const payload: PaginatedResponse<TripLog> = {
    data: rows.map((row) => mapTripLogRow(row)),
    page,
    pageSize,
    total: totalRow.total,
    totalPages: Math.max(1, Math.ceil(totalRow.total / pageSize)),
  };

  res.json(payload);
});

adminRouter.get("/trips/live", (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          ${TRIP_SELECT},
          ${USER_SELECT}
        FROM trips
        INNER JOIN users ON users.id = trips.user_id
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        WHERE trips.status = 'IN_TRANSIT'
        ORDER BY trips.entry_time DESC, trips.id DESC
      `,
    )
    .all() as Record<string, unknown>[];

  res.json(rows.map((row) => mapTripLogRow(row)));
});
