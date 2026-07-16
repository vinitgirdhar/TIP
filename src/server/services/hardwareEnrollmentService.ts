import { randomUUID } from "crypto";
import type {
  FingerprintEnrollmentSession,
  FingerprintEnrollmentStatus,
  User,
} from "../../shared/types";
import { USER_SELECT, getDb, mapUserRow } from "../db";
import {
  getHardwareDeviceByDeviceId,
  linkFingerprintToUser,
  TransitFlowError,
} from "./transitFlowService";

const SENSOR_FINGERPRINT_ID_MIN = 1;
const SENSOR_FINGERPRINT_ID_MAX = 127;
const ENROLLMENT_EXPIRY_MS = 5 * 60 * 1000;

interface EnrollmentSessionRecord {
  id: string;
  userId: number;
  fingerprintId: number;
  deviceId: string;
  status: FingerprintEnrollmentStatus;
  message: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
}

const enrollmentSessions = new Map<string, EnrollmentSessionRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function extendExpiry(fromIso: string): string {
  return new Date(new Date(fromIso).getTime() + ENROLLMENT_EXPIRY_MS).toISOString();
}

function isActiveStatus(status: FingerprintEnrollmentStatus): boolean {
  return status === "pending" || status === "claimed";
}

function isTerminalStatus(status: FingerprintEnrollmentStatus): boolean {
  return status === "completed" || status === "failed" || status === "expired";
}

function expireStaleEnrollments(): void {
  const now = Date.now();

  for (const session of enrollmentSessions.values()) {
    if (!isActiveStatus(session.status)) {
      continue;
    }

    if (new Date(session.expiresAt).getTime() <= now) {
      session.status = "expired";
      session.error = "Enrollment request timed out before the hardware completed it.";
      session.message = "Enrollment request expired. Start a new request from the website.";
      session.updatedAt = nowIso();
    }
  }
}

function getUserSnapshot(userId: number): User | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT ${USER_SELECT}
        FROM users
        WHERE users.id = ?
      `,
    )
    .get(userId) as Record<string, unknown> | undefined;

  return row ? mapUserRow(row) : null;
}

function buildPublicEnrollmentSession(record: EnrollmentSessionRecord): FingerprintEnrollmentSession {
  return {
    id: record.id,
    userId: record.userId,
    fingerprintId: record.fingerprintId,
    deviceId: record.deviceId,
    status: record.status,
    message: record.message,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    claimedAt: record.claimedAt,
    completedAt: record.completedAt,
    expiresAt: record.expiresAt,
    user: getUserSnapshot(record.userId),
    device: getHardwareDeviceByDeviceId(record.deviceId),
  };
}

function getOrderedActiveSessions(): EnrollmentSessionRecord[] {
  return [...enrollmentSessions.values()]
    .filter((session) => isActiveStatus(session.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function reserveFingerprintIds(): Set<number> {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT fingerprint_id
        FROM users
        WHERE fingerprint_id IS NOT NULL
      `,
    )
    .all() as Array<{ fingerprint_id: number }>;

  const reserved = new Set<number>(rows.map((row) => Number(row.fingerprint_id)));

  for (const session of enrollmentSessions.values()) {
    if (isActiveStatus(session.status)) {
      reserved.add(session.fingerprintId);
    }
  }

  return reserved;
}

function allocateFingerprintIdForUser(user: User): number {
  if (user.fingerprintId != null) {
    return user.fingerprintId;
  }

  const reserved = reserveFingerprintIds();

  for (let fingerprintId = SENSOR_FINGERPRINT_ID_MIN; fingerprintId <= SENSOR_FINGERPRINT_ID_MAX; fingerprintId += 1) {
    if (!reserved.has(fingerprintId)) {
      return fingerprintId;
    }
  }

  throw new TransitFlowError("No fingerprint slots are available in the supported sensor range.", 409);
}

function getEnrollmentRecordOrThrow(enrollmentId: string): EnrollmentSessionRecord {
  expireStaleEnrollments();

  const session = enrollmentSessions.get(enrollmentId);

  if (!session) {
    throw new TransitFlowError("Fingerprint enrollment request not found.", 404);
  }

  return session;
}

function failEnrollmentSession(record: EnrollmentSessionRecord, reason: string): FingerprintEnrollmentSession {
  const updatedAt = nowIso();

  record.status = "failed";
  record.error = reason;
  record.message = reason;
  record.updatedAt = updatedAt;
  record.expiresAt = extendExpiry(updatedAt);

  return buildPublicEnrollmentSession(record);
}

export function startWebsiteFingerprintEnrollment(input: {
  userId: number;
  deviceId: string;
}): FingerprintEnrollmentSession {
  expireStaleEnrollments();

  const userId = input.userId;
  const deviceId = input.deviceId.trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new TransitFlowError("User ID must be a positive integer.", 400);
  }

  if (!deviceId) {
    throw new TransitFlowError("Device ID is required.", 400);
  }

  const user = getUserSnapshot(userId);

  if (!user) {
    throw new TransitFlowError("User not found.", 404);
  }

  if (user.status !== "ACTIVE") {
    throw new TransitFlowError("Only active users can be enrolled on hardware.", 403);
  }

  const device = getHardwareDeviceByDeviceId(deviceId);

  if (!device) {
    throw new TransitFlowError("Hardware device is not registered.", 404);
  }

  const blockingSession = getOrderedActiveSessions().find(
    (session) => session.userId === userId || session.deviceId === deviceId,
  );

  if (blockingSession) {
    throw new TransitFlowError(
      blockingSession.userId === userId
        ? "This user already has a hardware enrollment in progress."
        : "This hardware device already has an enrollment in progress.",
      409,
    );
  }

  const fingerprintId = allocateFingerprintIdForUser(user);
  const createdAt = nowIso();
  const isReregistration = user.fingerprintId != null;
  const session: EnrollmentSessionRecord = {
    id: randomUUID(),
    userId,
    fingerprintId,
    deviceId,
    status: "pending",
    message: isReregistration
      ? `Waiting for ${device.label} to re-register fingerprint ID ${fingerprintId}.`
      : `Waiting for ${device.label} to start enrollment.`,
    error: null,
    createdAt,
    updatedAt: createdAt,
    claimedAt: null,
    completedAt: null,
    expiresAt: extendExpiry(createdAt),
  };

  enrollmentSessions.set(session.id, session);

  return buildPublicEnrollmentSession(session);
}

export function getFingerprintEnrollmentSession(enrollmentId: string): FingerprintEnrollmentSession | null {
  expireStaleEnrollments();

  const session = enrollmentSessions.get(enrollmentId.trim());
  return session ? buildPublicEnrollmentSession(session) : null;
}

export function claimNextFingerprintEnrollment(deviceId: string): FingerprintEnrollmentSession | null {
  expireStaleEnrollments();

  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    throw new TransitFlowError("Device ID is required.", 400);
  }

  const device = getHardwareDeviceByDeviceId(normalizedDeviceId);

  if (!device) {
    throw new TransitFlowError("Hardware device is not registered.", 404);
  }

  const claimedSession = getOrderedActiveSessions().find(
    (session) => session.deviceId === normalizedDeviceId && session.status === "claimed",
  );

  if (claimedSession) {
    claimedSession.updatedAt = nowIso();
    claimedSession.expiresAt = extendExpiry(claimedSession.updatedAt);
    return buildPublicEnrollmentSession(claimedSession);
  }

  const pendingSession = getOrderedActiveSessions().find(
    (session) => session.deviceId === normalizedDeviceId && session.status === "pending",
  );

  if (!pendingSession) {
    return null;
  }

  const claimedAt = nowIso();
  pendingSession.status = "claimed";
  pendingSession.message =
    getUserSnapshot(pendingSession.userId)?.fingerprintId != null
      ? `Device ${device.deviceId} acknowledged the re-registration request. Place finger on sensor.`
      : `Device ${device.deviceId} acknowledged the enrollment request. Place finger on sensor.`;
  pendingSession.claimedAt = claimedAt;
  pendingSession.updatedAt = claimedAt;
  pendingSession.expiresAt = extendExpiry(claimedAt);

  return buildPublicEnrollmentSession(pendingSession);
}

export function completeFingerprintEnrollment(input: {
  enrollmentId: string;
  deviceId: string;
  fingerprintId: number;
}): FingerprintEnrollmentSession {
  const session = getEnrollmentRecordOrThrow(input.enrollmentId.trim());
  const deviceId = input.deviceId.trim();
  const fingerprintId = input.fingerprintId;

  if (!deviceId) {
    throw new TransitFlowError("Device ID is required.", 400);
  }

  if (!Number.isInteger(fingerprintId) || fingerprintId <= 0) {
    throw new TransitFlowError("Fingerprint ID must be a positive integer.", 400);
  }

  if (session.deviceId !== deviceId) {
    throw new TransitFlowError("This enrollment request belongs to a different hardware device.", 409);
  }

  if (session.status === "completed") {
    return buildPublicEnrollmentSession(session);
  }

  if (isTerminalStatus(session.status)) {
    throw new TransitFlowError("This enrollment request is no longer active.", 409);
  }

  if (session.fingerprintId !== fingerprintId) {
    failEnrollmentSession(
      session,
      `Device enrolled fingerprint ID ${fingerprintId}, but the website reserved ID ${session.fingerprintId}.`,
    );
    throw new TransitFlowError("Hardware enrolled an unexpected fingerprint ID.", 409);
  }

  try {
    linkFingerprintToUser({
      userId: session.userId,
      fingerprintId: session.fingerprintId,
      deviceId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Failed to link the enrolled fingerprint.";
    failEnrollmentSession(session, reason);
    throw error;
  }

  const completedAt = nowIso();
  session.status = "completed";
  session.message = `Fingerprint ${session.fingerprintId} enrolled and linked successfully.`;
  session.error = null;
  session.updatedAt = completedAt;
  session.completedAt = completedAt;
  session.expiresAt = extendExpiry(completedAt);

  return buildPublicEnrollmentSession(session);
}

export function markFingerprintEnrollmentFailed(input: {
  enrollmentId: string;
  deviceId: string;
  reason: string;
}): FingerprintEnrollmentSession {
  const session = getEnrollmentRecordOrThrow(input.enrollmentId.trim());
  const deviceId = input.deviceId.trim();
  const reason = input.reason.trim() || "Hardware enrollment failed.";

  if (!deviceId) {
    throw new TransitFlowError("Device ID is required.", 400);
  }

  if (session.deviceId !== deviceId) {
    throw new TransitFlowError("This enrollment request belongs to a different hardware device.", 409);
  }

  if (session.status === "completed") {
    throw new TransitFlowError("Completed enrollment requests cannot be marked as failed.", 409);
  }

  return failEnrollmentSession(session, reason);
}
