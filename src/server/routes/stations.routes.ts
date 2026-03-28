import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { getDb, mapStationRow, stationSelect } from "../db";

export const stationsRouter = Router();

stationsRouter.use(authenticateToken);

stationsRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT ${stationSelect("stations", "station")}
        FROM stations
        ORDER BY stations.id ASC
      `,
    )
    .all() as Record<string, unknown>[];

  res.json(rows.map((row) => mapStationRow(row, "station")));
});
