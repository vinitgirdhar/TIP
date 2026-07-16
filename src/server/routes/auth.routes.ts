import bcrypt from "bcryptjs";
import { Router } from "express";
import {
  FINGERPRINT_SELECT,
  USER_SELECT,
  WALLET_SELECT,
  getDb,
  mapFingerprintRow,
  mapUserRow,
  mapWalletRow,
} from "../db";
import {
  authenticateToken,
  optionalAuthenticate,
  signAuthToken,
  type AuthenticatedRequest,
} from "../middleware/auth";
import { getSessionBundle } from "../services/transitFlowService";
import type { Fingerprint, User, UserRole, Wallet } from "../../shared/types";

export const authRouter = Router();

function hasFingerprintEnrollment(payload: { user: User; fingerprint: Fingerprint | null }): boolean {
  return payload.user.fingerprintId !== null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildTemporaryPassword(govId: string): string {
  const compactGovId = govId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `${compactGovId.slice(-6) || "TIPUSER"}!23`;
}

authRouter.post("/register", optionalAuthenticate, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const isAdminRegistration = req.auth?.role === "ADMIN";

  const fullName = String(req.body?.fullName || "").trim();
  const govId = String(req.body?.govId || "").trim().toUpperCase();
  const email = normalizeEmail(String(req.body?.email || ""));
  const mobile = String(req.body?.mobile || "").trim();
  const requestedPassword = String(req.body?.password || "").trim();
  const plainPassword = requestedPassword || (isAdminRegistration ? buildTemporaryPassword(govId) : "");
  const role = isAdminRegistration && req.body?.role === "ADMIN" ? "ADMIN" : ("USER" as UserRole);

  if (!fullName || !govId || !email || !mobile) {
    res.status(400).json({ message: "Full name, government ID, email, and mobile are required." });
    return;
  }

  if (!plainPassword) {
    res.status(400).json({ message: "Password is required." });
    return;
  }

  const existingUser = db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE email = ? OR gov_id = ?
      `,
    )
    .get(email, govId) as { id: number } | undefined;

  if (existingUser) {
    res.status(409).json({ message: "A user with that email or government ID already exists." });
    return;
  }

  const createdAt = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(plainPassword, 10);

  const createUserTransaction = db.transaction(() => {
    const userResult = db
      .prepare(
        `
          INSERT INTO users (full_name, gov_id, email, mobile, password_hash, role, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(fullName, govId, email, mobile, passwordHash, role, "ACTIVE", createdAt);

    const userId = Number(userResult.lastInsertRowid);

    db.prepare(
      `
        INSERT INTO wallets (user_id, balance, updated_at)
        VALUES (?, ?, ?)
      `,
    ).run(userId, 0, createdAt);

    return getSessionBundle(userId);
  });

  const session = createUserTransaction();

  if (!session) {
    res.status(500).json({ message: "Failed to create user session." });
    return;
  }

  if (isAdminRegistration) {
    res.status(201).json({
      user: session.user,
      wallet: session.wallet,
      fingerprint: session.fingerprint,
      temporaryPassword: requestedPassword ? null : plainPassword,
      createdByAdmin: true,
    });
    return;
  }

  res.status(201).json({
    token: signAuthToken({ userId: session.user.id, role: session.user.role }),
    user: session.user,
    wallet: session.wallet,
    fingerprint: session.fingerprint,
    requiresEnrollment: true,
  });
});

authRouter.post("/login", (req, res) => {
  const db = getDb();
  const email = normalizeEmail(String(req.body?.email || ""));
  const password = String(req.body?.password || "");

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required." });
    return;
  }

  const row = db
    .prepare(
      `
        SELECT
          ${USER_SELECT},
          ${WALLET_SELECT},
          ${FINGERPRINT_SELECT},
          users.password_hash AS password_hash
        FROM users
        INNER JOIN wallets ON wallets.user_id = users.id
        LEFT JOIN fingerprints ON fingerprints.user_id = users.id
        WHERE users.email = ?
      `,
    )
    .get(email) as (Record<string, unknown> & { password_hash: string }) | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ message: "Invalid credentials." });
    return;
  }

  const user = mapUserRow(row);
  const fingerprint = row.fingerprint_id == null ? null : mapFingerprintRow(row);

  if (user.status === "SUSPENDED") {
    res.status(403).json({ message: "This account is suspended." });
    return;
  }

  res.json({
    token: signAuthToken({ userId: user.id, role: user.role }),
    user,
    wallet: mapWalletRow(row),
    fingerprint,
    requiresEnrollment: !hasFingerprintEnrollment({ user, fingerprint }),
  });
});

authRouter.get("/me", authenticateToken, (req: AuthenticatedRequest, res) => {
  const session = getSessionBundle(req.auth!.userId);

  if (!session) {
    res.status(404).json({ message: "User session not found." });
    return;
  }

  res.json({
    user: session.user,
    wallet: session.wallet,
    fingerprint: session.fingerprint,
    requiresEnrollment: !hasFingerprintEnrollment(session),
  });
});
