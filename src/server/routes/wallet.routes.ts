import { Router } from "express";
import {
  TRANSACTION_SELECT,
  TRIP_SELECT,
  WALLET_SELECT,
  getDb,
  mapTransactionRow,
  mapTripRow,
  mapWalletRow,
} from "../db";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { MAX_WALLET_RECHARGE } from "../fareConfig";

export const walletRouter = Router();

walletRouter.use(authenticateToken);

walletRouter.get("/", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const walletRow = db
    .prepare(
      `
        SELECT ${WALLET_SELECT}
        FROM wallets
        WHERE wallets.user_id = ?
      `,
    )
    .get(req.auth!.userId) as Record<string, unknown> | undefined;

  if (!walletRow) {
    res.status(404).json({ message: "Wallet not found." });
    return;
  }

  const activeTripRow = db
    .prepare(
      `
        SELECT
          ${TRIP_SELECT}
        FROM trips
        INNER JOIN stations AS entry_station ON entry_station.id = trips.entry_station_id
        LEFT JOIN stations AS exit_station ON exit_station.id = trips.exit_station_id
        WHERE trips.user_id = ? AND trips.status = 'IN_TRANSIT'
      `,
    )
    .get(req.auth!.userId) as Record<string, unknown> | undefined;

  res.json({
    wallet: mapWalletRow(walletRow),
    activeTrip: activeTripRow ? mapTripRow(activeTripRow) : null,
  });
});

walletRouter.post("/recharge", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const amount = Number(req.body?.amount);

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_WALLET_RECHARGE) {
    res.status(400).json({ message: `Recharge amount must be greater than 0 and no more than ${MAX_WALLET_RECHARGE}.` });
    return;
  }

  const rechargeTransaction = db.transaction(() => {
    const walletRow = db
      .prepare(
        `
          SELECT ${WALLET_SELECT}
          FROM wallets
          WHERE wallets.user_id = ?
        `,
      )
      .get(req.auth!.userId) as Record<string, unknown> | undefined;

    if (!walletRow) {
      throw new Error("Wallet not found.");
    }

    const wallet = mapWalletRow(walletRow);
    const nextBalance = Number((wallet.balance + amount).toFixed(2));
    const updatedAt = new Date().toISOString();

    db.prepare(
      `
        UPDATE wallets
        SET balance = ?, updated_at = ?
        WHERE user_id = ?
      `,
    ).run(nextBalance, updatedAt, req.auth!.userId);

    const transactionResult = db
      .prepare(
        `
          INSERT INTO transactions (user_id, type, amount, reference_id, balance_after, description, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        req.auth!.userId,
        "RECHARGE",
        Number(amount.toFixed(2)),
        `recharge:${Date.now()}`,
        nextBalance,
        "Wallet recharge",
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
      .get(req.auth!.userId) as Record<string, unknown>;

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
    res.status(201).json(rechargeTransaction());
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Recharge failed." });
  }
});

walletRouter.get("/transactions", (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT ${TRANSACTION_SELECT}
        FROM transactions
        WHERE transactions.user_id = ?
        ORDER BY transactions.created_at DESC, transactions.id DESC
      `,
    )
    .all(req.auth!.userId) as Record<string, unknown>[];

  res.json(rows.map((row) => mapTransactionRow(row)));
});
