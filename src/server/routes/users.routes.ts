import { Router } from "express";
import {
  FINGERPRINT_SELECT,
  TRANSACTION_SELECT,
  TRIP_SELECT,
  USER_SELECT,
  WALLET_SELECT,
  getDb,
  mapFingerprintRow,
  mapTransactionRow,
  mapTripRow,
  mapUserRow,
  mapUserSummaryRow,
  mapWalletRow,
} from "../db";
import { authenticateToken, requireAdmin, type AuthenticatedRequest } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.use(authenticateToken, requireAdmin);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

usersRouter.get("/", (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          ${USER_SELECT},
          wallets.balance AS wallet_balance,
          CASE WHEN users.fingerprint_id IS NULL THEN 0 ELSE 1 END AS fingerprint_enrolled,
          MAX(COALESCE(trips.exit_time, trips.entry_time, transactions.created_at, users.created_at)) AS last_activity_at
        FROM users
        INNER JOIN wallets ON wallets.user_id = users.id
        LEFT JOIN fingerprints ON fingerprints.user_id = users.id
        LEFT JOIN trips ON trips.user_id = users.id
        LEFT JOIN transactions ON transactions.user_id = users.id
        WHERE users.role = 'USER'
        GROUP BY users.id
        ORDER BY users.created_at DESC
      `,
    )
    .all() as Record<string, unknown>[];

  res.json(rows.map((row) => mapUserSummaryRow(row)));
});

usersRouter.get("/:id", (req, res) => {
  const db = getDb();
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ message: "A valid user ID is required." });
    return;
  }

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
        WHERE users.id = ? AND users.role = 'USER'
      `,
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ message: "User not found." });
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
    .get(userId) as Record<string, unknown> | undefined;

  res.json({
    user: mapUserRow(row),
    wallet: mapWalletRow(row),
    fingerprint: row.fingerprint_id == null ? null : mapFingerprintRow(row),
    activeTrip: activeTripRow ? mapTripRow(activeTripRow) : null,
  });
});

usersRouter.put("/:id", (req, res) => {
  const db = getDb();
  const userId = Number(req.params.id);
  const fullName = String(req.body?.fullName || "").trim();
  const govId = String(req.body?.govId || "").trim().toUpperCase();
  const email = normalizeEmail(String(req.body?.email || ""));
  const mobile = String(req.body?.mobile || "").trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ message: "A valid user ID is required." });
    return;
  }

  if (!fullName || !govId || !email || !mobile) {
    res.status(400).json({ message: "Full name, government ID, email, and mobile are required." });
    return;
  }

  const existingUser = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE role = 'USER'
          AND id != ?
          AND (email = ? OR gov_id = ?)
      `,
    )
    .get(userId, email, govId) as { id: number } | undefined;

  if (existingUser) {
    res.status(409).json({ message: "Another user already uses that email or government ID." });
    return;
  }

  const updateResult = db
    .prepare(
      `
        UPDATE users
        SET full_name = ?, gov_id = ?, email = ?, mobile = ?
        WHERE id = ? AND role = 'USER'
      `,
    )
    .run(fullName, govId, email, mobile, userId);

  if (!updateResult.changes) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const updatedUser = db
    .prepare(
      `
        SELECT ${USER_SELECT}
        FROM users
        WHERE users.id = ?
      `,
    )
    .get(userId) as Record<string, unknown>;

  res.json({ user: mapUserRow(updatedUser) });
});

usersRouter.put("/:id/status", (req, res) => {
  const db = getDb();
  const userId = Number(req.params.id);
  const nextStatus = String(req.body?.status || "").trim().toUpperCase();

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ message: "A valid user ID is required." });
    return;
  }

  if (!["ACTIVE", "PENDING", "SUSPENDED"].includes(nextStatus)) {
    res.status(400).json({ message: "Status must be ACTIVE, PENDING, or SUSPENDED." });
    return;
  }

  const updateResult = db
    .prepare(
      `
        UPDATE users
        SET status = ?
        WHERE id = ? AND role = 'USER'
      `,
    )
    .run(nextStatus, userId);

  if (!updateResult.changes) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const updatedUser = db
    .prepare(
      `
        SELECT ${USER_SELECT}
        FROM users
        WHERE users.id = ?
      `,
    )
    .get(userId) as Record<string, unknown>;

  res.json({ user: mapUserRow(updatedUser) });
});

usersRouter.post("/:id/allocate", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const userId = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const description = String(req.body?.description || "Admin allocation").trim();

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ message: "A valid user ID is required." });
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: "Allocation amount must be greater than 0." });
    return;
  }

  const allocateFunds = db.transaction(() => {
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
      throw new Error("Wallet not found.");
    }

    const wallet = mapWalletRow(walletRow);
    const updatedAt = new Date().toISOString();
    const nextBalance = Number((wallet.balance + amount).toFixed(2));

    db.prepare(
      `
        UPDATE wallets
        SET balance = ?, updated_at = ?
        WHERE user_id = ?
      `,
    ).run(nextBalance, updatedAt, userId);

    const transactionResult = db
      .prepare(
        `
          INSERT INTO transactions (user_id, type, amount, reference_id, balance_after, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        userId,
        "ADMIN_ALLOCATION",
        Number(amount.toFixed(2)),
        `admin:${req.auth!.userId}:${Date.now()}`,
        nextBalance,
        description,
        updatedAt,
      );

    const updatedWalletRow = db
      .prepare(
        `
          SELECT ${WALLET_SELECT}
          FROM wallets
          WHERE wallets.user_id = ?
        `,
      )
      .get(userId) as Record<string, unknown>;

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
      wallet: mapWalletRow(updatedWalletRow),
      transaction: mapTransactionRow(transactionRow),
    };
  });

  try {
    res.status(201).json(allocateFunds());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Allocation failed." });
  }
});
