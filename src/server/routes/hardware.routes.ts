import { type Response, Router } from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth";
import {
  claimNextFingerprintEnrollment,
  completeFingerprintEnrollment,
  getFingerprintEnrollmentSession,
  markFingerprintEnrollmentFailed,
  startWebsiteFingerprintEnrollment,
} from "../services/hardwareEnrollmentService";
import {
  linkFingerprintToUser,
  TransitFlowError,
  listHardwareDevices,
  registerHardwareUser,
  verifyFingerprintTap,
} from "../services/transitFlowService";

export const hardwareRouter = Router();

function sendError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof TransitFlowError) {
    res.status(error.statusCode).json({
      access: "denied",
      reason: error.message,
      status: error.verificationStatus,
      action: null,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    access: "denied",
    reason: fallbackMessage,
    status: "blocked",
    action: null,
    message: fallbackMessage,
  });
}

hardwareRouter.post("/register-user", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const fingerprintId = Number(req.body?.fingerprint_id);
  const balance = req.body?.balance == null ? undefined : Number(req.body.balance);

  try {
    const session = registerHardwareUser({ name, fingerprintId, balance });

    res.status(201).json({
      user: session.user,
      wallet: session.wallet,
      fingerprint: session.fingerprint,
      temporaryPassword: session.temporaryPassword,
      createdByHardwareRegistration: true,
    });
  } catch (error) {
    sendError(res, error, "Hardware user registration failed.");
  }
});

hardwareRouter.get("/fingerprint/devices", (_req, res) => {
  res.json(listHardwareDevices());
});

hardwareRouter.post("/fingerprint/enrollment/start", authenticateToken, requireAdmin, (req, res) => {
  const userId = Number(req.body?.user_id);
  const deviceId = String(req.body?.device_id || "").trim();

  try {
    const session = startWebsiteFingerprintEnrollment({ userId, deviceId });
    res.status(201).json(session);
  } catch (error) {
    sendError(res, error, "Hardware fingerprint enrollment could not be started.");
  }
});

hardwareRouter.get("/fingerprint/enrollment/:enrollmentId", authenticateToken, requireAdmin, (req, res) => {
  const enrollmentId = String(req.params.enrollmentId || "").trim();

  try {
    const session = getFingerprintEnrollmentSession(enrollmentId);

    if (!session) {
      res.status(404).json({ message: "Fingerprint enrollment request not found." });
      return;
    }

    res.json(session);
  } catch (error) {
    sendError(res, error, "Fingerprint enrollment status lookup failed.");
  }
});

hardwareRouter.post("/register-fingerprint", (req, res) => {
  const userId = Number(req.body?.user_id);
  const fingerprintId = Number(req.body?.fingerprint_id);
  const deviceId = req.body?.device_id == null ? undefined : String(req.body.device_id).trim();

  try {
    const session = linkFingerprintToUser({ userId, fingerprintId, deviceId });

    res.json({
      message: "Fingerprint linked successfully.",
      user_id: session.user.id,
      fingerprint_id: session.user.fingerprintId,
      user: session.user,
      wallet: session.wallet,
      fingerprint: session.fingerprint,
      device_id: deviceId ?? null,
    });
  } catch (error) {
    sendError(res, error, "Fingerprint linking failed.");
  }
});

hardwareRouter.get("/hardware/fingerprint/enrollment/next", (req, res) => {
  const deviceId = String(req.query.device_id || "").trim();

  try {
    const session = claimNextFingerprintEnrollment(deviceId);

    if (!session) {
      res.json({
        pending: false,
        pollIntervalMs: 2000,
        enrollmentId: null,
        userId: null,
        userName: null,
        fingerprintId: null,
        deviceId: null,
        message: null,
      });
      return;
    }

    res.json({
      pending: true,
      pollIntervalMs: 2000,
      enrollmentId: session.id,
      userId: session.userId,
      userName: session.user?.fullName ?? null,
      fingerprintId: session.fingerprintId,
      deviceId: session.deviceId,
      message: session.message,
    });
  } catch (error) {
    sendError(res, error, "Hardware enrollment polling failed.");
  }
});

hardwareRouter.post("/hardware/fingerprint/enrollment/:enrollmentId/complete", (req, res) => {
  const enrollmentId = String(req.params.enrollmentId || "").trim();
  const deviceId = String(req.body?.device_id || "").trim();
  const fingerprintId = Number(req.body?.fingerprint_id);

  try {
    const session = completeFingerprintEnrollment({
      enrollmentId,
      deviceId,
      fingerprintId,
    });

    res.json({
      message: session.message,
      enrollment: session,
    });
  } catch (error) {
    sendError(res, error, "Hardware enrollment completion failed.");
  }
});

hardwareRouter.post("/hardware/fingerprint/enrollment/:enrollmentId/fail", (req, res) => {
  const enrollmentId = String(req.params.enrollmentId || "").trim();
  const deviceId = String(req.body?.device_id || "").trim();
  const reason = String(req.body?.reason || "").trim();

  try {
    const session = markFingerprintEnrollmentFailed({
      enrollmentId,
      deviceId,
      reason,
    });

    res.json({
      message: session.message,
      enrollment: session,
    });
  } catch (error) {
    sendError(res, error, "Hardware enrollment failure reporting failed.");
  }
});

hardwareRouter.post("/fingerprint/verify", (req, res) => {
  const fingerprintId = Number(req.body?.fingerprint_id);
  const deviceId = String(req.body?.device_id || "").trim();

  if (!Number.isInteger(fingerprintId) || fingerprintId <= 0) {
    res.status(400).json({
      access: "denied",
      reason: "Fingerprint ID must be a positive integer.",
      status: "blocked",
      action: null,
      message: "Fingerprint ID must be a positive integer.",
    });
    return;
  }

  if (!deviceId) {
    res.status(400).json({
      access: "denied",
      reason: "Device ID is required.",
      status: "blocked",
      action: null,
      message: "Device ID is required.",
    });
    return;
  }

  try {
    res.json(verifyFingerprintTap(fingerprintId, deviceId));
  } catch (error) {
    sendError(res, error, "Fingerprint verification failed.");
  }
});
