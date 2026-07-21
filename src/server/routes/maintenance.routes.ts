import { type Response, Router } from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth";
import {
  MaintenanceError,
  createMaintenanceTicket,
  getMaintenanceSummary,
  listMaintenanceTickets,
  updateMaintenanceStatus,
} from "../services/maintenanceService";
import type { MaintenanceCategory, MaintenanceSeverity } from "../../shared/types";

export const maintenanceRouter = Router();

function sendMaintenanceError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof MaintenanceError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: fallbackMessage });
}

maintenanceRouter.use(authenticateToken, requireAdmin);

maintenanceRouter.get("/", (req, res) => {
  res.json(
    listMaintenanceTickets({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      deviceId: typeof req.query.deviceId === "string" ? req.query.deviceId : undefined,
    }),
  );
});

maintenanceRouter.get("/summary", (_req, res) => {
  res.json(getMaintenanceSummary());
});

maintenanceRouter.post("/", (req, res) => {
  try {
    const ticket = createMaintenanceTicket({
      title: String(req.body?.title || ""),
      description: String(req.body?.description || ""),
      deviceId: req.body?.deviceId == null ? null : String(req.body.deviceId),
      category: req.body?.category as MaintenanceCategory | undefined,
      severity: req.body?.severity as MaintenanceSeverity | undefined,
      source: "MANUAL",
    });

    res.status(201).json({ ticket });
  } catch (error) {
    sendMaintenanceError(res, error, "Failed to create maintenance ticket.");
  }
});

maintenanceRouter.put("/:id/status", (req, res) => {
  const ticketId = Number(req.params.id);

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    res.status(400).json({ message: "A valid ticket ID is required." });
    return;
  }

  try {
    const ticket = updateMaintenanceStatus(ticketId, String(req.body?.status || ""));
    res.json({ ticket });
  } catch (error) {
    sendMaintenanceError(res, error, "Failed to update maintenance ticket.");
  }
});
