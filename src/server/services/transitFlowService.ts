import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type {
  Fingerprint,
  HardwareDevice,
  HardwareFingerprintVerificationResponse,
  Transaction,
  Trip,
  User,
  Wallet,
} from "../../shared/types";
import {
  FINGERPRINT_SELECT,
  HARDWARE_DEVICE_SELECT,
  TRANSACTION_SELECT,
  TRIP_SELECT,
  USER_SELECT,
  WALLET_SELECT,
  getDb,
  mapFingerprintRow,
  mapHardwareDeviceRow,
  mapTransactionRow,
  mapTripRow,
  mapUserRow,
  mapWalletRow,
} from "../db";
import { calculateFare } from "./fareCalculator";

export class TransitFlowError extends Error {
  statusCode: number;
  verificationStatus: HardwareFingerprintVerificationResponse["status"];

  constructor(
    message: string,
    statusCode = 400,
    verificationStatus: HardwareFingerprintVerificationResponse["status"] = "blocked",
  ) {
    super(message);
    this.name = "TransitFlowError";
    this.statusCode = statusCode;
    this.verificationStatus = verificationStatus;
  }
}

export interface SessionBundle {
  user: User;
  wallet: Wallet;
  fingerprint: Fingerprint | null;
}

export interface TripCompletionResult {
  trip: Trip;
  wallet: Wallet;
  transaction: Transaction;
  fare: number;
}

function getFingerprintFromJoinedRow(row: Record<string, unknown>): Fingerprint | null {
  return row.fingerprint_id == null ? null : mapFingerprintRow(row);
}

function buildVerificationSuccess(
  payload: Omit<HardwareFingerprintVerificationResponse, "access" | "reason" | "status">,
): HardwareFingerprintVerificationResponse {
  return {
    access: "granted",
    reason: null,
    status: "allowed",
    ...payload,
  };
}

export function getSessionBundle(userId: number): SessionBundle | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          ${USER_SELECT},
          ${WALLET_SELECT},
          ${FINGERPRINT_SELECT}
        FROM users
        INNER JOIN wallets ON wallets.user_id = users.id
        LEFT JOIN fingerprints ON fingerprints.user_id = users.id
        WHERE users.id = ?
      `,
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    user: mapUserRow(row),
    wallet: mapWalletRow(row),
    fingerprint: getFingerprintFromJoinedRow(row),
  };
}

function getUserById(userId: number): User | null {
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

export function getSessionBundleByFingerprintId(fingerprintId: number): SessionBundle | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          ${USER_SELECT},
          ${WALLET_SELECT},
          ${FINGERPRINT_SELECT}
        FROM users
        INNER JOIN wallets ON wallets.user_id = users.id
        LEFT JOIN fingerprints ON fingerprints.user_id = users.id
        WHERE users.fingerprint_id = ?
      `,
    )
    .get(fingerprintId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    user: mapUserRow(row),
    wallet: mapWalletRow(row),
    fingerprint: getFingerprintFromJoinedRow(row),
  };
}

export function getActiveTripForUser(userId: number): Trip | null {
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
    .get(userId) as Record<string, unknown> | undefined;

  return row ? mapTripRow(row) : null;
}

function getStationExists(stationId: number): boolean {
  const db = getDb();
  const row = db.prepare("SELECT id FROM stations WHERE id = ?").get(stationId) as { id: number } | undefined;
  return Boolean(row);
}

function assertActiveUser(userId: number): User {
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

  if (!row) {
    throw new TransitFlowError("User not found.", 404);
  }

  const user = mapUserRow(row);

  if (user.status !== "ACTIVE") {
    throw new TransitFlowError("Only active users can start trips.", 403);
  }

  return user;
}

export function startTripForUser(userId: number, stationId: number): Trip {
  const db = getDb();

  assertActiveUser(userId);

  if (getActiveTripForUser(userId)) {
    throw new TransitFlowError("User already has an active trip.", 409);
  }

  if (!getStationExists(stationId)) {
    throw new TransitFlowError("Entry station not found.", 404);
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
      .run(userId, stationId, entryTime, "IN_TRANSIT").lastInsertRowid,
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
    .get(tripId) as Record<string, unknown> | undefined;

  if (!tripRow) {
    throw new TransitFlowError("Failed to create trip.", 500);
  }

  return mapTripRow(tripRow);
}

export function completeTripForUser(userId: number, stationId: number): TripCompletionResult {
  const db = getDb();
  const activeTrip = getActiveTripForUser(userId);

  if (!activeTrip) {
    throw new TransitFlowError("No active trip found.", 404);
  }

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
    throw new TransitFlowError("Exit station not found.", 404);
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
    .get(userId) as Record<string, unknown> | undefined;

  if (!walletRow) {
    throw new TransitFlowError("Wallet not found.", 404);
  }

  const wallet = mapWalletRow(walletRow);

  if (wallet.balance < fare) {
    throw new TransitFlowError("Insufficient wallet balance for fare deduction.", 402);
  }

  return db.transaction(() => {
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
    ).run(nextBalance, completedAt, userId);

    const transactionResult = db
      .prepare(
        `
          INSERT INTO transactions (user_id, type, amount, reference_id, balance_after, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        userId,
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
      .get(activeTrip.id) as Record<string, unknown> | undefined;

    const updatedWalletRow = db
      .prepare(
        `
          SELECT ${WALLET_SELECT}
          FROM wallets
          WHERE wallets.user_id = ?
        `,
      )
      .get(userId) as Record<string, unknown> | undefined;

    const transactionRow = db
      .prepare(
        `
          SELECT ${TRANSACTION_SELECT}
          FROM transactions
          WHERE transactions.id = ?
        `,
      )
      .get(Number(transactionResult.lastInsertRowid)) as Record<string, unknown> | undefined;

    if (!tripRow || !updatedWalletRow || !transactionRow) {
      throw new TransitFlowError("Failed to settle trip.", 500);
    }

    return {
      trip: mapTripRow(tripRow),
      wallet: mapWalletRow(updatedWalletRow),
      transaction: mapTransactionRow(transactionRow),
      fare,
    };
  })();
}

export function listHardwareDevices(): HardwareDevice[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT ${HARDWARE_DEVICE_SELECT}
        FROM hardware_devices
        INNER JOIN stations AS device_station ON device_station.id = hardware_devices.station_id
        ORDER BY hardware_devices.device_id ASC
      `,
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => mapHardwareDeviceRow(row));
}

export function getHardwareDeviceByDeviceId(deviceId: string): HardwareDevice | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT ${HARDWARE_DEVICE_SELECT}
        FROM hardware_devices
        INNER JOIN stations AS device_station ON device_station.id = hardware_devices.station_id
        WHERE hardware_devices.device_id = ?
      `,
    )
    .get(deviceId.trim()) as Record<string, unknown> | undefined;

  return row ? mapHardwareDeviceRow(row) : null;
}

function buildHardwarePassword(fingerprintId: number): string {
  return `Tap-${String(fingerprintId).padStart(4, "0")}-${randomUUID().slice(0, 8)}`;
}

export function linkFingerprintToUser(input: {
  userId: number;
  fingerprintId: number;
  deviceId?: string;
}): SessionBundle {
  const db = getDb();
  const userId = input.userId;
  const fingerprintId = input.fingerprintId;

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new TransitFlowError("User ID must be a positive integer.", 400);
  }

  if (!Number.isInteger(fingerprintId) || fingerprintId <= 0) {
    throw new TransitFlowError("Fingerprint ID must be a positive integer.", 400);
  }

  if (!getUserById(userId)) {
    throw new TransitFlowError("User not found.", 404);
  }

  const existingLink = db
    .prepare(
      `
        SELECT ${USER_SELECT}
        FROM users
        WHERE users.fingerprint_id = ?
      `,
    )
    .get(fingerprintId) as Record<string, unknown> | undefined;

  if (existingLink && Number(existingLink.user_id) !== userId) {
    throw new TransitFlowError("This fingerprint ID is already linked to another user.", 409);
  }

  db.transaction(() => {
    db.prepare(
      `
        UPDATE users
        SET fingerprint_id = ?
        WHERE id = ?
      `,
    ).run(fingerprintId, userId);
  })();

  const session = getSessionBundle(userId);

  if (!session) {
    throw new TransitFlowError("Failed to load the updated fingerprint session.", 500);
  }

  return session;
}

export function registerHardwareUser(input: {
  name: string;
  fingerprintId: number;
  balance?: number;
}): SessionBundle & { temporaryPassword: string } {
  const db = getDb();
  const name = input.name.trim();
  const fingerprintId = input.fingerprintId;
  const openingBalance = Number((input.balance ?? 0).toFixed(2));

  if (!name) {
    throw new TransitFlowError("Name is required.", 400);
  }

  if (!Number.isInteger(fingerprintId) || fingerprintId <= 0) {
    throw new TransitFlowError("Fingerprint ID must be a positive integer.", 400);
  }

  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    throw new TransitFlowError("Opening balance must be 0 or greater.", 400);
  }

  const existingUser = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE fingerprint_id = ?
      `,
    )
    .get(fingerprintId) as { id: number } | undefined;

  if (existingUser) {
    throw new TransitFlowError("Fingerprint ID is already linked to another user.", 409);
  }

  const govId = `FP-USER-${String(fingerprintId).padStart(6, "0")}`;
  const email = `fingerprint-${fingerprintId}@hardware.transit.local`;
  const mobile = `+1000${String(fingerprintId).padStart(8, "0")}`;
  const plainPassword = buildHardwarePassword(fingerprintId);
  const passwordHash = bcrypt.hashSync(plainPassword, 10);
  const createdAt = new Date().toISOString();

  try {
    return db.transaction(() => {
      const userResult = db
        .prepare(
          `
            INSERT INTO users (
              full_name,
              gov_id,
              email,
              mobile,
              fingerprint_id,
              password_hash,
              role,
              status,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(name, govId, email, mobile, fingerprintId, passwordHash, "USER", "ACTIVE", createdAt);

      const userId = Number(userResult.lastInsertRowid);

      db.prepare(
        `
          INSERT INTO wallets (user_id, balance, updated_at)
          VALUES (?, ?, ?)
        `,
      ).run(userId, openingBalance, createdAt);

      const session = getSessionBundle(userId);

      if (!session) {
        throw new TransitFlowError("Failed to create hardware user session.", 500);
      }

      return {
        ...session,
        temporaryPassword: plainPassword,
      };
    })();
  } catch (error) {
    if (error instanceof TransitFlowError) {
      throw error;
    }

    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new TransitFlowError("Fingerprint ID is already linked to another user.", 409);
    }

    throw error;
  }
}

export function verifyFingerprintTap(
  fingerprintId: number,
  deviceId: string,
): HardwareFingerprintVerificationResponse {
  const device = getHardwareDeviceByDeviceId(deviceId);

  if (!device) {
    throw new TransitFlowError("Hardware device is not registered.", 404);
  }

  const session = getSessionBundleByFingerprintId(fingerprintId);

  if (!session) {
    throw new TransitFlowError("Fingerprint is not linked to any user.", 401, "unauthorized");
  }

  if (session.user.status !== "ACTIVE") {
    throw new TransitFlowError("This account is suspended.", 403);
  }

  const activeTrip = getActiveTripForUser(session.user.id);
  const gateMode = device.gateMode;

  if (gateMode === "ENTRY") {
    if (activeTrip) {
      throw new TransitFlowError("User already has an active trip. Please exit first.", 409);
    }

    const trip = startTripForUser(session.user.id, device.station.id);
    const nextSession = getSessionBundle(session.user.id) ?? session;

    return buildVerificationSuccess({
      action: "TAP_IN",
      message: `Check-in granted at ${device.station.name}.`,
      device,
      user: nextSession.user,
      wallet: nextSession.wallet,
      trip,
      transaction: null,
      fare: null,
    });
  }

  if (gateMode === "EXIT") {
    if (!activeTrip) {
      throw new TransitFlowError("No active trip found. Did you check in?", 404);
    }

    const result = completeTripForUser(session.user.id, device.station.id);

    return buildVerificationSuccess({
      action: "TAP_OUT",
      message: `Check-out granted at ${device.station.name}. Fare settled.`,
      device,
      user: session.user,
      wallet: result.wallet,
      trip: result.trip,
      transaction: result.transaction,
      fare: result.fare,
    });
  }

  if (!activeTrip) {
    const trip = startTripForUser(session.user.id, device.station.id);
    const nextSession = getSessionBundle(session.user.id) ?? session;

    return buildVerificationSuccess({
      action: "TAP_IN",
      message: `Tap in recorded at ${device.station.name}.`,
      device,
      user: nextSession.user,
      wallet: nextSession.wallet,
      trip,
      transaction: null,
      fare: null,
    });
  }

  const result = completeTripForUser(session.user.id, device.station.id);

  return buildVerificationSuccess({
    action: "TAP_OUT",
    message: `Tap out recorded at ${device.station.name}. Fare settled.`,
    device,
    user: session.user,
    wallet: result.wallet,
    trip: result.trip,
    transaction: result.transaction,
    fare: result.fare,
  });
}
