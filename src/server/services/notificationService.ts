import type {
  Guardian,
  Notification,
  NotificationAudience,
  NotificationCategory,
  NotificationSeverity,
} from "../../shared/types";
import {
  GUARDIAN_SELECT,
  NOTIFICATION_SELECT,
  getDb,
  mapGuardianRow,
  mapNotificationRow,
} from "../db";

/**
 * Notification + guardian service.
 *
 * This is the "People / Process" layer of the IoE upgrade. It records passenger
 * alerts, fans messages out to administrators, and keeps guardian contacts that
 * are alerted on trips and low balances. Delivery here is in-app (persisted
 * notifications); the same records are the hook point for real SMS/email/push
 * gateways in a production deployment.
 */

const MAX_NOTIFICATION_LIMIT = 100;
const DEFAULT_NOTIFICATION_LIMIT = 30;

export class NotificationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "NotificationError";
    this.statusCode = statusCode;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateNotificationInput {
  userId: number;
  category: NotificationCategory;
  title: string;
  body: string;
  audience?: NotificationAudience;
  severity?: NotificationSeverity;
  metadata?: Record<string, unknown> | null;
}

export function createNotification(input: CreateNotificationInput): Notification {
  const db = getDb();
  const createdAt = nowIso();
  const audience = input.audience ?? "USER";
  const severity = input.severity ?? "INFO";
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

  const result = db
    .prepare(
      `
        INSERT INTO notifications (user_id, audience, category, severity, title, body, metadata, read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `,
    )
    .run(input.userId, audience, input.category, severity, input.title, input.body, metadata, createdAt);

  const row = db
    .prepare(
      `
        SELECT ${NOTIFICATION_SELECT}
        FROM notifications
        WHERE notifications.id = ?
      `,
    )
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

  return mapNotificationRow(row);
}

function listAdminUserIds(): number[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id FROM users WHERE role = 'ADMIN'")
    .all() as Array<{ id: number }>;
  return rows.map((row) => Number(row.id));
}

/**
 * Fan a single alert out to every administrator so it appears in each admin
 * inbox. Returns the notifications that were created.
 */
export function notifyAdmins(
  input: Omit<CreateNotificationInput, "userId" | "audience">,
): Notification[] {
  return listAdminUserIds().map((adminId) =>
    createNotification({ ...input, userId: adminId, audience: "ADMIN" }),
  );
}

export function listNotifications(
  userId: number,
  options: { unreadOnly?: boolean; limit?: number; audience?: NotificationAudience } = {},
): Notification[] {
  const db = getDb();
  const filters = ["notifications.user_id = ?"];
  const params: Array<string | number> = [userId];

  if (options.unreadOnly) {
    filters.push("notifications.read = 0");
  }

  if (options.audience) {
    filters.push("notifications.audience = ?");
    params.push(options.audience);
  }

  const limit = Math.min(
    MAX_NOTIFICATION_LIMIT,
    Math.max(1, options.limit ?? DEFAULT_NOTIFICATION_LIMIT),
  );

  const rows = db
    .prepare(
      `
        SELECT ${NOTIFICATION_SELECT}
        FROM notifications
        WHERE ${filters.join(" AND ")}
        ORDER BY notifications.created_at DESC, notifications.id DESC
        LIMIT ?
      `,
    )
    .all(...params, limit) as Record<string, unknown>[];

  return rows.map((row) => mapNotificationRow(row));
}

export function countUnreadNotifications(userId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE user_id = ? AND read = 0
      `,
    )
    .get(userId) as { count: number };
  return Number(row.count);
}

export function countUnreadAdminNotifications(): number {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE audience = 'ADMIN' AND read = 0
      `,
    )
    .get() as { count: number };
  return Number(row.count);
}

export function markNotificationRead(userId: number, notificationId: number): Notification {
  const db = getDb();
  const updateResult = db
    .prepare(
      `
        UPDATE notifications
        SET read = 1
        WHERE id = ? AND user_id = ?
      `,
    )
    .run(notificationId, userId);

  if (!updateResult.changes) {
    throw new NotificationError("Notification not found.", 404);
  }

  const row = db
    .prepare(
      `
        SELECT ${NOTIFICATION_SELECT}
        FROM notifications
        WHERE notifications.id = ?
      `,
    )
    .get(notificationId) as Record<string, unknown>;

  return mapNotificationRow(row);
}

export function markAllNotificationsRead(userId: number): number {
  const db = getDb();
  const result = db
    .prepare(
      `
        UPDATE notifications
        SET read = 1
        WHERE user_id = ? AND read = 0
      `,
    )
    .run(userId);

  return Number(result.changes);
}

// ---------------------------------------------------------------------------
// Guardians
// ---------------------------------------------------------------------------

export function listGuardiansForUser(userId: number): Guardian[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT ${GUARDIAN_SELECT}
        FROM guardians
        WHERE guardians.user_id = ?
        ORDER BY guardians.created_at ASC, guardians.id ASC
      `,
    )
    .all(userId) as Record<string, unknown>[];

  return rows.map((row) => mapGuardianRow(row));
}

export interface AddGuardianInput {
  userId: number;
  name: string;
  mobile: string;
  email?: string | null;
  relationship?: string | null;
  notifyOnTrip?: boolean;
  notifyOnLowBalance?: boolean;
  lowBalanceThreshold?: number;
}

export function addGuardian(input: AddGuardianInput): Guardian {
  const db = getDb();
  const name = input.name.trim();
  const mobile = input.mobile.trim();
  const email = input.email?.trim() || null;
  const relationship = input.relationship?.trim() || null;

  if (!name) {
    throw new NotificationError("Guardian name is required.");
  }

  if (!mobile) {
    throw new NotificationError("Guardian mobile is required.");
  }

  const threshold = Number(input.lowBalanceThreshold ?? 50);

  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new NotificationError("Low balance threshold must be 0 or greater.");
  }

  const createdAt = nowIso();
  const result = db
    .prepare(
      `
        INSERT INTO guardians (
          user_id, name, mobile, email, relationship,
          notify_on_trip, notify_on_low_balance, low_balance_threshold, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.userId,
      name,
      mobile,
      email,
      relationship,
      input.notifyOnTrip === false ? 0 : 1,
      input.notifyOnLowBalance === false ? 0 : 1,
      Number(threshold.toFixed(2)),
      createdAt,
    );

  const row = db
    .prepare(
      `
        SELECT ${GUARDIAN_SELECT}
        FROM guardians
        WHERE guardians.id = ?
      `,
    )
    .get(Number(result.lastInsertRowid)) as Record<string, unknown>;

  return mapGuardianRow(row);
}

export function removeGuardian(userId: number, guardianId: number): void {
  const db = getDb();
  const result = db
    .prepare(
      `
        DELETE FROM guardians
        WHERE id = ? AND user_id = ?
      `,
    )
    .run(guardianId, userId);

  if (!result.changes) {
    throw new NotificationError("Guardian not found.", 404);
  }
}

/**
 * Record a guardian-facing alert for a passenger. One notification is stored
 * per matching guardian (audience GUARDIAN), carrying the guardian contact in
 * metadata so a downstream SMS/email gateway can dispatch it.
 */
export function dispatchGuardianAlert(input: {
  userId: number;
  trigger: "TRIP" | "LOW_BALANCE";
  title: string;
  body: string;
  severity?: NotificationSeverity;
  metadata?: Record<string, unknown>;
}): Notification[] {
  const guardians = listGuardiansForUser(input.userId).filter((guardian) =>
    input.trigger === "TRIP" ? guardian.notifyOnTrip : guardian.notifyOnLowBalance,
  );

  return guardians.map((guardian) =>
    createNotification({
      userId: input.userId,
      audience: "GUARDIAN",
      category: "GUARDIAN",
      severity: input.severity ?? "INFO",
      title: input.title,
      body: `${input.body} (Guardian: ${guardian.name}, ${guardian.mobile})`,
      metadata: {
        ...(input.metadata ?? {}),
        trigger: input.trigger,
        guardianId: guardian.id,
        guardianName: guardian.name,
        guardianMobile: guardian.mobile,
        guardianEmail: guardian.email,
      },
    }),
  );
}
