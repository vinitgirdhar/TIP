import { createHash, randomUUID } from "crypto";
import { getDb, FINGERPRINT_SELECT, USER_SELECT, mapFingerprintRow, mapUserRow } from "../db";
import type { Fingerprint, User } from "../../shared/types";

const FINGERPRINT_ALGORITHM = "SHA-256";

export function generateFingerprintHash(seed?: string): string {
  return createHash("sha256")
    .update(seed?.trim() || `${Date.now()}-${randomUUID()}`)
    .digest("hex");
}

export function enrollFingerprint(userId: number, seed?: string, hardwareFingerprintId?: number): Fingerprint {
  const db = getDb();
  const fingerprintHash = generateFingerprintHash(seed || `${userId}-${randomUUID()}`);
  const enrolledAt = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO fingerprints (user_id, fingerprint_hash, algorithm, enrolled_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        fingerprint_hash = excluded.fingerprint_hash,
        algorithm = excluded.algorithm,
        enrolled_at = excluded.enrolled_at
    `,
  ).run(userId, fingerprintHash, FINGERPRINT_ALGORITHM, enrolledAt);

  const row = db
    .prepare(
      `
        SELECT ${FINGERPRINT_SELECT}
        FROM fingerprints
        WHERE fingerprints.user_id = ?
      `,
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Failed to enroll fingerprint.");
  }

  const fingerprint = mapFingerprintRow(row);
  const currentUserFingerprintRow = db
    .prepare(
      `
        SELECT fingerprint_id
        FROM users
        WHERE id = ?
      `,
    )
    .get(userId) as { fingerprint_id: number | null } | undefined;

  const resolvedFingerprintId = hardwareFingerprintId ?? currentUserFingerprintRow?.fingerprint_id ?? fingerprint.id;

  db.prepare(
    `
      UPDATE users
      SET fingerprint_id = ?
      WHERE id = ?
    `,
  ).run(resolvedFingerprintId, userId);

  return fingerprint;
}

export function verifyFingerprintHash(
  fingerprintHash: string,
): { user: User; fingerprint: Fingerprint } | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          ${USER_SELECT},
          ${FINGERPRINT_SELECT}
        FROM fingerprints
        INNER JOIN users ON users.id = fingerprints.user_id
        WHERE fingerprints.fingerprint_hash = ?
      `,
    )
    .get(fingerprintHash.trim()) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    user: mapUserRow(row),
    fingerprint: mapFingerprintRow(row),
  };
}
