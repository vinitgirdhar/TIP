import type {
  MaintenanceCategory,
  MaintenanceSeverity,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceTicket,
} from "../../shared/types";
import { MAINTENANCE_TICKET_SELECT, getDb, mapMaintenanceTicketRow } from "../db";

/**
 * Maintenance ticket service.
 *
 * Part of the IoE "Process / Things" layer: hardware and operational issues are
 * captured as tickets, either raised manually by an operator or generated
 * automatically by the scheduled task runner (device health, anomalies).
 */

const CATEGORIES: MaintenanceCategory[] = ["SENSOR", "GATE", "NETWORK", "GENERAL"];
const SEVERITIES: MaintenanceSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: MaintenanceStatus[] = ["OPEN", "ACKNOWLEDGED", "RESOLVED"];

export class MaintenanceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "MaintenanceError";
    this.statusCode = statusCode;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function stationIdForDevice(deviceId: string | null): number | null {
  if (!deviceId) {
    return null;
  }

  const db = getDb();
  const row = db
    .prepare("SELECT station_id FROM hardware_devices WHERE device_id = ?")
    .get(deviceId) as { station_id: number } | undefined;

  return row ? Number(row.station_id) : null;
}

function getTicketById(id: number): MaintenanceTicket | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT ${MAINTENANCE_TICKET_SELECT}
        FROM maintenance_tickets
        LEFT JOIN stations AS ticket_station ON ticket_station.id = maintenance_tickets.station_id
        WHERE maintenance_tickets.id = ?
      `,
    )
    .get(id) as Record<string, unknown> | undefined;

  return row ? mapMaintenanceTicketRow(row) : null;
}

export interface CreateMaintenanceTicketInput {
  title: string;
  description: string;
  deviceId?: string | null;
  category?: MaintenanceCategory;
  severity?: MaintenanceSeverity;
  source?: MaintenanceSource;
}

export function createMaintenanceTicket(input: CreateMaintenanceTicketInput): MaintenanceTicket {
  const db = getDb();
  const title = input.title.trim();
  const description = input.description.trim();
  const deviceId = input.deviceId?.trim() || null;
  const category = input.category && CATEGORIES.includes(input.category) ? input.category : "GENERAL";
  const severity = input.severity && SEVERITIES.includes(input.severity) ? input.severity : "MEDIUM";
  const source: MaintenanceSource = input.source === "AUTO" ? "AUTO" : "MANUAL";

  if (!title) {
    throw new MaintenanceError("Ticket title is required.");
  }

  if (!description) {
    throw new MaintenanceError("Ticket description is required.");
  }

  const timestamp = nowIso();
  const result = db
    .prepare(
      `
        INSERT INTO maintenance_tickets (
          device_id, station_id, category, severity, status, title, description, source, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
      `,
    )
    .run(
      deviceId,
      stationIdForDevice(deviceId),
      category,
      severity,
      title,
      description,
      source,
      timestamp,
      timestamp,
    );

  const ticket = getTicketById(Number(result.lastInsertRowid));

  if (!ticket) {
    throw new MaintenanceError("Failed to create maintenance ticket.", 500);
  }

  return ticket;
}

/**
 * Returns an existing OPEN/ACKNOWLEDGED ticket that matches the device and
 * category, used by automated generators to avoid raising duplicates.
 */
export function findActiveTicket(
  deviceId: string | null,
  category: MaintenanceCategory,
): MaintenanceTicket | null {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT ${MAINTENANCE_TICKET_SELECT}
        FROM maintenance_tickets
        LEFT JOIN stations AS ticket_station ON ticket_station.id = maintenance_tickets.station_id
        WHERE maintenance_tickets.category = ?
          AND maintenance_tickets.status != 'RESOLVED'
          AND ((maintenance_tickets.device_id IS NULL AND ? IS NULL) OR maintenance_tickets.device_id = ?)
        ORDER BY maintenance_tickets.created_at DESC
        LIMIT 1
      `,
    )
    .get(category, deviceId, deviceId) as Record<string, unknown> | undefined;

  return row ? mapMaintenanceTicketRow(row) : null;
}

export function listMaintenanceTickets(
  filters: { status?: string; deviceId?: string } = {},
): MaintenanceTicket[] {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];
  const status = filters.status?.trim().toUpperCase();
  const deviceId = filters.deviceId?.trim();

  if (status && STATUSES.includes(status as MaintenanceStatus)) {
    where.push("maintenance_tickets.status = ?");
    params.push(status);
  }

  if (deviceId) {
    where.push("maintenance_tickets.device_id = ?");
    params.push(deviceId);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
        SELECT ${MAINTENANCE_TICKET_SELECT}
        FROM maintenance_tickets
        LEFT JOIN stations AS ticket_station ON ticket_station.id = maintenance_tickets.station_id
        ${whereClause}
        ORDER BY
          CASE maintenance_tickets.status WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
          maintenance_tickets.created_at DESC
      `,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((row) => mapMaintenanceTicketRow(row));
}

export function updateMaintenanceStatus(id: number, nextStatus: string): MaintenanceTicket {
  const status = nextStatus.trim().toUpperCase() as MaintenanceStatus;

  if (!STATUSES.includes(status)) {
    throw new MaintenanceError("Status must be OPEN, ACKNOWLEDGED, or RESOLVED.");
  }

  const db = getDb();
  const timestamp = nowIso();
  const resolvedAt = status === "RESOLVED" ? timestamp : null;

  const result = db
    .prepare(
      `
        UPDATE maintenance_tickets
        SET status = ?, updated_at = ?, resolved_at = ?
        WHERE id = ?
      `,
    )
    .run(status, timestamp, resolvedAt, id);

  if (!result.changes) {
    throw new MaintenanceError("Maintenance ticket not found.", 404);
  }

  const ticket = getTicketById(id);

  if (!ticket) {
    throw new MaintenanceError("Failed to load the updated maintenance ticket.", 500);
  }

  return ticket;
}

export function getMaintenanceSummary(): {
  open: number;
  acknowledged: number;
  resolved: number;
  total: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT status, COUNT(*) AS count
        FROM maintenance_tickets
        GROUP BY status
      `,
    )
    .all() as Array<{ status: MaintenanceStatus; count: number }>;

  const summary = { open: 0, acknowledged: 0, resolved: 0, total: 0 };

  for (const row of rows) {
    const count = Number(row.count);
    summary.total += count;
    if (row.status === "OPEN") summary.open = count;
    if (row.status === "ACKNOWLEDGED") summary.acknowledged = count;
    if (row.status === "RESOLVED") summary.resolved = count;
  }

  return summary;
}

export function countOpenMaintenanceTickets(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM maintenance_tickets WHERE status != 'RESOLVED'")
    .get() as { count: number };
  return Number(row.count);
}
