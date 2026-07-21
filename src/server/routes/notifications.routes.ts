import { type Response, Router } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import {
  NotificationError,
  addGuardian,
  countUnreadNotifications,
  listGuardiansForUser,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeGuardian,
} from "../services/notificationService";

export const notificationsRouter = Router();

function sendNotificationError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof NotificationError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: fallbackMessage });
}

notificationsRouter.use(authenticateToken);

notificationsRouter.get("/", (req: AuthenticatedRequest, res) => {
  const unreadOnly = String(req.query.unread || "") === "1" || req.query.unread === "true";
  const limit = req.query.limit == null ? undefined : Number(req.query.limit);

  res.json(
    listNotifications(req.auth!.userId, {
      unreadOnly,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
  );
});

notificationsRouter.get("/unread-count", (req: AuthenticatedRequest, res) => {
  res.json({ count: countUnreadNotifications(req.auth!.userId) });
});

notificationsRouter.post("/read-all", (req: AuthenticatedRequest, res) => {
  res.json({ updated: markAllNotificationsRead(req.auth!.userId) });
});

notificationsRouter.post("/:id/read", (req: AuthenticatedRequest, res) => {
  const notificationId = Number(req.params.id);

  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    res.status(400).json({ message: "A valid notification ID is required." });
    return;
  }

  try {
    res.json({ notification: markNotificationRead(req.auth!.userId, notificationId) });
  } catch (error) {
    sendNotificationError(res, error, "Failed to mark notification as read.");
  }
});

// ---------------------------------------------------------------------------
// Guardians (People pillar)
// ---------------------------------------------------------------------------

notificationsRouter.get("/guardians", (req: AuthenticatedRequest, res) => {
  res.json(listGuardiansForUser(req.auth!.userId));
});

notificationsRouter.post("/guardians", (req: AuthenticatedRequest, res) => {
  try {
    const guardian = addGuardian({
      userId: req.auth!.userId,
      name: String(req.body?.name || ""),
      mobile: String(req.body?.mobile || ""),
      email: req.body?.email == null ? null : String(req.body.email),
      relationship: req.body?.relationship == null ? null : String(req.body.relationship),
      notifyOnTrip: req.body?.notifyOnTrip,
      notifyOnLowBalance: req.body?.notifyOnLowBalance,
      lowBalanceThreshold:
        req.body?.lowBalanceThreshold == null ? undefined : Number(req.body.lowBalanceThreshold),
    });

    res.status(201).json({ guardian });
  } catch (error) {
    sendNotificationError(res, error, "Failed to add guardian.");
  }
});

notificationsRouter.delete("/guardians/:id", (req: AuthenticatedRequest, res) => {
  const guardianId = Number(req.params.id);

  if (!Number.isInteger(guardianId) || guardianId <= 0) {
    res.status(400).json({ message: "A valid guardian ID is required." });
    return;
  }

  try {
    removeGuardian(req.auth!.userId, guardianId);
    res.json({ removed: true });
  } catch (error) {
    sendNotificationError(res, error, "Failed to remove guardian.");
  }
});
