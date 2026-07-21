import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";
import type {
  Fingerprint,
  Guardian,
  HardwareDevice,
  MaintenanceTicket,
  Notification,
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
  users.fingerprint_id AS user_fingerprint_id,
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

export const HARDWARE_DEVICE_SELECT = `
  hardware_devices.id AS hardware_device_id,
  hardware_devices.device_id AS hardware_device_device_id,
  hardware_devices.label AS hardware_device_label,
  hardware_devices.gate_mode AS hardware_device_gate_mode,
  hardware_devices.created_at AS hardware_device_created_at,
  ${stationSelect("device_station", "device_station")}
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

export const NOTIFICATION_SELECT = `
  notifications.id AS notification_id,
  notifications.user_id AS notification_user_id,
  notifications.audience AS notification_audience,
  notifications.category AS notification_category,
  notifications.severity AS notification_severity,
  notifications.title AS notification_title,
  notifications.body AS notification_body,
  notifications.metadata AS notification_metadata,
  notifications.read AS notification_read,
  notifications.created_at AS notification_created_at
`;

export const GUARDIAN_SELECT = `
  guardians.id AS guardian_id,
  guardians.user_id AS guardian_user_id,
  guardians.name AS guardian_name,
  guardians.mobile AS guardian_mobile,
  guardians.email AS guardian_email,
  guardians.relationship AS guardian_relationship,
  guardians.notify_on_trip AS guardian_notify_on_trip,
  guardians.notify_on_low_balance AS guardian_notify_on_low_balance,
  guardians.low_balance_threshold AS guardian_low_balance_threshold,
  guardians.created_at AS guardian_created_at
`;

export const MAINTENANCE_TICKET_SELECT = `
  maintenance_tickets.id AS maintenance_ticket_id,
  maintenance_tickets.device_id AS maintenance_ticket_device_id,
  maintenance_tickets.category AS maintenance_ticket_category,
  maintenance_tickets.severity AS maintenance_ticket_severity,
  maintenance_tickets.status AS maintenance_ticket_status,
  maintenance_tickets.title AS maintenance_ticket_title,
  maintenance_tickets.description AS maintenance_ticket_description,
  maintenance_tickets.source AS maintenance_ticket_source,
  maintenance_tickets.created_at AS maintenance_ticket_created_at,
  maintenance_tickets.updated_at AS maintenance_ticket_updated_at,
  maintenance_tickets.resolved_at AS maintenance_ticket_resolved_at,
  ${stationSelect("ticket_station", "ticket_station")}
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
    fingerprintId: optionalValue<number>(row, "user_fingerprint_id"),
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

export function mapHardwareDeviceRow(row: Row): HardwareDevice {
  return {
    id: Number(value(row, "hardware_device_id")),
    deviceId: String(value(row, "hardware_device_device_id")),
    label: String(value(row, "hardware_device_label")),
    gateMode: String(value(row, "hardware_device_gate_mode")) as HardwareDevice["gateMode"],
    station: mapStationRow(row, "device_station"),
    createdAt: String(value(row, "hardware_device_created_at")),
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

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function mapNotificationRow(row: Row): Notification {
  return {
    id: Number(value(row, "notification_id")),
    userId: Number(value(row, "notification_user_id")),
    audience: String(value(row, "notification_audience")) as Notification["audience"],
    category: String(value(row, "notification_category")) as Notification["category"],
    severity: String(value(row, "notification_severity")) as Notification["severity"],
    title: String(value(row, "notification_title")),
    body: String(value(row, "notification_body")),
    metadata: parseMetadata(row.notification_metadata),
    read: Boolean(Number(value(row, "notification_read"))),
    createdAt: String(value(row, "notification_created_at")),
  };
}

export function mapGuardianRow(row: Row): Guardian {
  return {
    id: Number(value(row, "guardian_id")),
    userId: Number(value(row, "guardian_user_id")),
    name: String(value(row, "guardian_name")),
    mobile: String(value(row, "guardian_mobile")),
    email: optionalValue<string>(row, "guardian_email"),
    relationship: optionalValue<string>(row, "guardian_relationship"),
    notifyOnTrip: Boolean(Number(value(row, "guardian_notify_on_trip"))),
    notifyOnLowBalance: Boolean(Number(value(row, "guardian_notify_on_low_balance"))),
    lowBalanceThreshold: Number(value(row, "guardian_low_balance_threshold")),
    createdAt: String(value(row, "guardian_created_at")),
  };
}

export function mapMaintenanceTicketRow(row: Row): MaintenanceTicket {
  return {
    id: Number(value(row, "maintenance_ticket_id")),
    deviceId: optionalValue<string>(row, "maintenance_ticket_device_id"),
    station:
      optionalValue<number>(row, "ticket_station_id") === null
        ? null
        : mapStationRow(row, "ticket_station"),
    category: String(value(row, "maintenance_ticket_category")) as MaintenanceTicket["category"],
    severity: String(value(row, "maintenance_ticket_severity")) as MaintenanceTicket["severity"],
    status: String(value(row, "maintenance_ticket_status")) as MaintenanceTicket["status"],
    title: String(value(row, "maintenance_ticket_title")),
    description: String(value(row, "maintenance_ticket_description")),
    source: String(value(row, "maintenance_ticket_source")) as MaintenanceTicket["source"],
    createdAt: String(value(row, "maintenance_ticket_created_at")),
    updatedAt: String(value(row, "maintenance_ticket_updated_at")),
    resolvedAt: optionalValue<string>(row, "maintenance_ticket_resolved_at"),
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
      fingerprint_id INTEGER,
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

    CREATE TABLE IF NOT EXISTS hardware_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      gate_mode TEXT NOT NULL DEFAULT 'BOTH',
      station_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      audience TEXT NOT NULL DEFAULT 'USER' CHECK (audience IN ('USER', 'ADMIN', 'GUARDIAN')),
      category TEXT NOT NULL CHECK (category IN ('TRIP', 'WALLET', 'SECURITY', 'MAINTENANCE', 'SYSTEM', 'GUARDIAN')),
      severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      metadata TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT,
      relationship TEXT,
      notify_on_trip INTEGER NOT NULL DEFAULT 1,
      notify_on_low_balance INTEGER NOT NULL DEFAULT 1,
      low_balance_threshold REAL NOT NULL DEFAULT 50,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      station_id INTEGER,
      category TEXT NOT NULL DEFAULT 'GENERAL' CHECK (category IN ('SENSOR', 'GATE', 'NETWORK', 'GENERAL')),
      severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('AUTO', 'MANUAL')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (station_id) REFERENCES stations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_guardians_user
      ON guardians(user_id);

    CREATE INDEX IF NOT EXISTS idx_maintenance_status
      ON maintenance_tickets(status, created_at DESC);
  `);
}

function tableHasColumn(db: SqliteDatabase, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function runMigrations(db: SqliteDatabase): void {
  if (!tableHasColumn(db, "users", "fingerprint_id")) {
    db.exec("ALTER TABLE users ADD COLUMN fingerprint_id INTEGER");
  }

  if (!tableHasColumn(db, "hardware_devices", "gate_mode")) {
    db.exec("ALTER TABLE hardware_devices ADD COLUMN gate_mode TEXT NOT NULL DEFAULT 'BOTH'");
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fingerprint_id_unique
    ON users(fingerprint_id)
    WHERE fingerprint_id IS NOT NULL;
  `);

  db.exec(`
    UPDATE users
    SET fingerprint_id = (
      SELECT fingerprints.id
      FROM fingerprints
      WHERE fingerprints.user_id = users.id
    )
    WHERE fingerprint_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM fingerprints
        WHERE fingerprints.user_id = users.id
      );
  `);

  db.exec(`
    UPDATE hardware_devices
    SET gate_mode = CASE
      WHEN lower(device_id) LIKE '%entry%' THEN 'ENTRY'
      WHEN lower(device_id) LIKE '%exit%' THEN 'EXIT'
      ELSE 'BOTH'
    END
    WHERE gate_mode IS NULL OR gate_mode NOT IN ('ENTRY', 'EXIT', 'BOTH');
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

function seedHardwareDevices(db: SqliteDatabase): void {
  const stations = db
    .prepare(
      `
        SELECT id, name
        FROM stations
        ORDER BY id ASC
      `,
    )
    .all() as Array<{ id: number; name: string }>;

  const upsertDevice = db.prepare(
    `
      INSERT INTO hardware_devices (device_id, label, gate_mode, station_id, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        label = excluded.label,
        gate_mode = excluded.gate_mode,
        station_id = excluded.station_id
    `,
  );

  const seededAt = nowIso();

  stations.forEach((station, index) => {
    const deviceSuffix = String(index + 1).padStart(2, "0");
    upsertDevice.run(`gate_${deviceSuffix}`, `${station.name} Gate`, "BOTH", station.id, seededAt);
    upsertDevice.run(`gate_entry_${deviceSuffix}`, `${station.name} Entry Gate`, "ENTRY", station.id, seededAt);
    upsertDevice.run(`gate_exit_${deviceSuffix}`, `${station.name} Exit Gate`, "EXIT", station.id, seededAt);
  });
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
  runMigrations(database);
  seedStations(database);
  seedHardwareDevices(database);
  seedAdminUser(database);

  return database;
}

export function getDb(): SqliteDatabase {
  if (!database) {
    return initDatabase();
  }

  return database;
}
