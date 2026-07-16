import { type Response, Router } from "express";
import {
  TRIP_SELECT,
  getDb,
  mapTripRow,
} from "../db";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import {
  TransitFlowError,
  completeTripForUser,
  getActiveTripForUser,
  startTripForUser,
} from "../services/transitFlowService";
import type { PaginatedResponse, Trip, TripStatus } from "../../shared/types";

export const tripsRouter = Router();

function sendTripError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof TransitFlowError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: fallbackMessage });
}

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
  const stationId = Number(req.body?.stationId);

  if (!Number.isInteger(stationId) || stationId <= 0) {
    res.status(400).json({ message: "A valid entry station is required." });
    return;
  }

  try {
    res.status(201).json({ trip: startTripForUser(req.auth!.userId, stationId) });
  } catch (error) {
    sendTripError(res, error, "Tap in failed.");
  }
});

tripsRouter.post("/exit", (req: AuthenticatedRequest, res) => {
  const stationId = Number(req.body?.stationId);

  if (!Number.isInteger(stationId) || stationId <= 0) {
    res.status(400).json({ message: "A valid exit station is required." });
    return;
  }

  try {
    res.json(completeTripForUser(req.auth!.userId, stationId));
  } catch (error) {
    sendTripError(res, error, "Tap out failed.");
  }
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
  res.json({
    trip: getActiveTripForUser(req.auth!.userId),
  });
});
