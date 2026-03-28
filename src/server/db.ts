import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";
import type {
  Fingerprint,
  Station,
  Transaction,
  Trip,
  TripLog,
  User,
  UserSummary,
  Wallet,
} from "../shared/types";

type SqliteDatabase = Database.Database;
type Row = Record<string, unknown>;

let database: SqliteDatabase | null = null;

const DEFAULT_DB_PATH = "transit.db";

const STATIONS_TO_SEED = [
  { code: "VRS", name: "Versova", zone: 1 },
  { code: "DNN", name: "DN Nagar", zone: 1 },
  { code: "AZN", name: "Azad Nagar", zone: 1 },
  { code: "ADH", name: "Andheri", zone: 2 },
  { code: "WEH", name: "Western Express Highway", zone: 2 },
  { code: "CHK", name: "Chakala (J.B. Nagar)", zone: 3 },
  { code: "APR", name: "Airport Road", zone: 3 },
  { code: "MRN", name: "Marol Naka", zone: 3 },
  { code: "SKN", name: "Saki Naka", zone: 4 },
  { code: "ASP", name: "Asalpha", zone: 4 },
  { code: "JGN", name: "Jagruti Nagar", zone: 5 },
  { code: "GKP", name: "Ghatkopar", zone: 5 },
];

export const USER_SELECT = `
  users.id AS user_id,
  users.full_name AS user_full_name,
  users.gov_id AS user_gov_id,
  users.email AS user_email,
  users.mobile AS user_mobile,
  users.role AS user_role,
  users.status AS user_status,
  users.created_at AS user_created_at
`;

export const WALLET_SELECT = `
  wallets.id AS wallet_id,
  wallets.user_id AS wallet_user_id,
  wallets.balance AS wallet_balance,
  wallets.updated_at AS wallet_updated_at
`;

export const FINGERPRINT_SELECT = `
  fingerprints.id AS fingerprint_id,
  fingerprints.user_id AS fingerprint_user_id,
  fingerprints.fingerprint_hash AS fingerprint_fingerprint_hash,
  fingerprints.algorithm AS fingerprint_algorithm,
  fingerprints.enrolled_at AS fingerprint_enrolled_at
`;

export const TRANSACTION_SELECT = `
  transactions.id AS transaction_id,
  transactions.user_id AS transaction_user_id,
  transactions.type AS transaction_type,
  transactions.amount AS transaction_amount,
  transactions.reference_id AS transaction_reference_id,
  transactions.balance_after AS transaction_balance_after,
  transactions.description AS transaction_description,
  transactions.created_at AS transaction_created_at
`;

export function stationSelect(tableAlias: string, prefix: string): string {
  return `
    ${tableAlias}.id AS ${prefix}_id,
    ${tableAlias}.code AS ${prefix}_code,
    ${tableAlias}.name AS ${prefix}_name,
    ${tableAlias}.zone AS ${prefix}_zone
  `;
}

export const TRIP_SELECT = `
  trips.id AS trip_id,
  trips.user_id AS trip_user_id,
  trips.entry_time AS trip_entry_time,
  trips.exit_time AS trip_exit_time,
  trips.fare AS trip_fare,
  trips.status AS trip_status,
  ${stationSelect("entry_station", "entry_station")},
  ${stationSelect("exit_station", "exit_station")}
`;

function value<T>(row: Row, key: string): T {
  return row[key] as T;
}

function optionalValue<T>(row: Row, key: string): T | null {
  const rowValue = row[key];
  return rowValue === null || rowValue === undefined ? null : (rowValue as T);
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveDatabasePath(): string {
  const configuredPath = process.env.DB_PATH?.trim() || DEFAULT_DB_PATH;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export function mapUserRow(row: Row): User {
  return {
    id: Number(value(row, "user_id")),
    fullName: String(value(row, "user_full_name")),
    govId: String(value(row, "user_gov_id")),
    email: String(value(row, "user_email")),
    mobile: String(value(row, "user_mobile")),
    role: String(value(row, "user_role")) as User["role"],
    status: String(value(row, "user_status")) as User["status"],
    createdAt: String(value(row, "user_created_at")),
  };
}

export function mapWalletRow(row: Row): Wallet {
  return {
    id: Number(value(row, "wallet_id")),
    userId: Number(value(row, "wallet_user_id")),
    balance: Number(value(row, "wallet_balance")),
    updatedAt: String(value(row, "wallet_updated_at")),
  };
}

export function mapFingerprintRow(row: Row): Fingerprint {
  return {
    id: Number(value(row, "fingerprint_id")),
    userId: Number(value(row, "fingerprint_user_id")),
    fingerprintHash: String(value(row, "fingerprint_fingerprint_hash")),
    algorithm: String(value(row, "fingerprint_algorithm")),
    enrolledAt: String(value(row, "fingerprint_enrolled_at")),
  };
}

export function mapStationRow(row: Row, prefix: string): Station {
  return {
    id: Number(value(row, `${prefix}_id`)),
    code: String(value(row, `${prefix}_code`)),
    name: String(value(row, `${prefix}_name`)),
    zone: Number(value(row, `${prefix}_zone`)),
  };
}

export function mapTripRow(row: Row): Trip {
  return {
    id: Number(value(row, "trip_id")),
    userId: Number(value(row, "trip_user_id")),
    entryStation: mapStationRow(row, "entry_station"),
    exitStation:
      optionalValue<number>(row, "exit_station_id") === null
        ? null
        : mapStationRow(row, "exit_station"),
    entryTime: String(value(row, "trip_entry_time")),
    exitTime: optionalValue<string>(row, "trip_exit_time"),
    fare: optionalValue<number>(row, "trip_fare"),
    status: String(value(row, "trip_status")) as Trip["status"],
  };
}

export function mapTripLogRow(row: Row): TripLog {
  return {
    ...mapTripRow(row),
    user: mapUserRow(row),
  };
}

export function mapTransactionRow(row: Row): Transaction {
  return {
    id: Number(value(row, "transaction_id")),
    userId: Number(value(row, "transaction_user_id")),
    type: String(value(row, "transaction_type")) as Transaction["type"],
    amount: Number(value(row, "transaction_amount")),
    referenceId: optionalValue<string>(row, "transaction_reference_id"),
    balanceAfter: Number(value(row, "transaction_balance_after")),
    description: String(value(row, "transaction_description")),
    createdAt: String(value(row, "transaction_created_at")),
  };
}

export function mapUserSummaryRow(row: Row): UserSummary {
  return {
    ...mapUserRow(row),
    walletBalance: Number(value(row, "wallet_balance")),
    fingerprintEnrolled: Boolean(value(row, "fingerprint_enrolled")),
    lastActivityAt: optionalValue<string>(row, "last_activity_at"),
  };
}

function createSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      zone INTEGER NOT NULL CHECK (zone >= 1 AND zone <= 5)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      gov_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      mobile TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      fingerprint_hash TEXT NOT NULL UNIQUE,
      algorithm TEXT NOT NULL,
      enrolled_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      balance REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      entry_station_id INTEGER NOT NULL,
      exit_station_id INTEGER,
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      fare REAL,
      status TEXT NOT NULL CHECK (status IN ('IN_TRANSIT', 'COMPLETED')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (entry_station_id) REFERENCES stations(id),
      FOREIGN KEY (exit_station_id) REFERENCES stations(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('RECHARGE', 'FARE_DEDUCTION', 'ADMIN_ALLOCATION')),
      amount REAL NOT NULL,
      reference_id TEXT,
      balance_after REAL NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function seedStations(db: SqliteDatabase): void {
  const existingStations = db
    .prepare("SELECT id, code FROM stations ORDER BY id ASC")
    .all() as Array<{ id: number; code: string }>;
  const currentCodes = existingStations.map((station) => station.code);
  const desiredCodes = STATIONS_TO_SEED.map((station) => station.code);
  const alreadySeeded =
    currentCodes.length === desiredCodes.length &&
    currentCodes.every((code, index) => code === desiredCodes[index]);

  const seed = db.transaction(() => {
    if (alreadySeeded) {
      const updateByCode = db.prepare(
        `
          UPDATE stations
          SET name = @name, zone = @zone
          WHERE code = @code
        `,
      );

      for (const station of STATIONS_TO_SEED) {
        updateByCode.run(station);
      }

      return;
    }

    const reserveCode = db.prepare("UPDATE stations SET code = ? WHERE id = ?");
    const updateById = db.prepare(
      `
        UPDATE stations
        SET code = @code, name = @name, zone = @zone
        WHERE id = @id
      `,
    );
    const insertStation = db.prepare(
      `
        INSERT INTO stations (code, name, zone)
        VALUES (@code, @name, @zone)
      `,
    );
    const tripsByStation = db.prepare(
      `
        SELECT COUNT(*) AS count
        FROM trips
        WHERE entry_station_id = ? OR exit_station_id = ?
      `,
    );
    const deleteStation = db.prepare("DELETE FROM stations WHERE id = ?");

    for (const station of existingStations) {
      reserveCode.run(`LEGACY-${station.id}`, station.id);
    }

    STATIONS_TO_SEED.forEach((station, index) => {
      const existingStation = existingStations[index];

      if (existingStation) {
        updateById.run({ ...station, id: existingStation.id });
      } else {
        insertStation.run(station);
      }
    });

    for (const station of existingStations.slice(STATIONS_TO_SEED.length)) {
      const referenceCount = tripsByStation.get(station.id, station.id) as { count: number };

      if (referenceCount.count === 0) {
        deleteStation.run(station.id);
      }
    }
  });

  seed();
}

function seedAdminUser(db: SqliteDatabase): void {
  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("admin@monolith.transit") as { id: number } | undefined;

  if (existingAdmin) {
    const existingWallet = db
      .prepare("SELECT id FROM wallets WHERE user_id = ?")
      .get(existingAdmin.id) as { id: number } | undefined;

    if (!existingWallet) {
      db.prepare(
        `
          INSERT INTO wallets (user_id, balance, updated_at)
          VALUES (?, ?, ?)
        `,
      ).run(existingAdmin.id, 0, nowIso());
    }

    return;
  }

  const createdAt = nowIso();
  const passwordHash = bcrypt.hashSync("admin123", 10);
  const insertAdmin = db.prepare(
    `
      INSERT INTO users (full_name, gov_id, email, mobile, password_hash, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const result = insertAdmin.run(
    "System Administrator",
    "ADMIN-ROOT-001",
    "admin@monolith.transit",
    "+1 (555) 000-0000",
    passwordHash,
    "ADMIN",
    "ACTIVE",
    createdAt,
  );
  const adminUserId = Number(result.lastInsertRowid);

  db.prepare(
    `
      INSERT INTO wallets (user_id, balance, updated_at)
      VALUES (?, ?, ?)
    `,
  ).run(adminUserId, 0, createdAt);
}

export function initDatabase(): SqliteDatabase {
  if (database) {
    return database;
  }

  database = new Database(resolveDatabasePath());
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  createSchema(database);
  seedStations(database);
  seedAdminUser(database);

  return database;
}

export function getDb(): SqliteDatabase {
  if (!database) {
    return initDatabase();
  }

  return database;
}
