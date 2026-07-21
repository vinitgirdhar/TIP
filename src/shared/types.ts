export type UserRole = "ADMIN" | "USER";

export type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

export type TripStatus = "IN_TRANSIT" | "COMPLETED";

export type TransactionType = "RECHARGE" | "FARE_DEDUCTION" | "ADMIN_ALLOCATION";

export type HardwareVerificationStatus = "allowed" | "blocked" | "unauthorized";

export type HardwareTapAction = "TAP_IN" | "TAP_OUT";

export type HardwareGateMode = "ENTRY" | "EXIT" | "BOTH";

export type HardwareAccessResult = "granted" | "denied";

export type FingerprintEnrollmentStatus = "pending" | "claimed" | "completed" | "failed" | "expired";

export interface User {
  id: number;
  fullName: string;
  govId: string;
  email: string;
  mobile: string;
  fingerprintId: number | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface Station {
  id: number;
  code: string;
  name: string;
  zone: number;
}

export interface Wallet {
  id: number;
  userId: number;
  balance: number;
  updatedAt: string;
}

export interface Trip {
  id: number;
  userId: number;
  entryStation: Station;
  exitStation: Station | null;
  entryTime: string;
  exitTime: string | null;
  fare: number | null;
  status: TripStatus;
}

export interface Transaction {
  id: number;
  userId: number;
  type: TransactionType;
  amount: number;
  referenceId: string | null;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface Fingerprint {
  id: number;
  userId: number;
  fingerprintHash: string;
  algorithm: string;
  enrolledAt: string;
}

export interface HardwareDevice {
  id: number;
  deviceId: string;
  label: string;
  gateMode: HardwareGateMode;
  station: Station;
  createdAt: string;
}

export interface HardwareFingerprintVerificationResponse {
  status: HardwareVerificationStatus;
  access: HardwareAccessResult;
  action: HardwareTapAction | null;
  message: string;
  reason: string | null;
  device: HardwareDevice | null;
  user: User | null;
  wallet: Wallet | null;
  trip: Trip | null;
  transaction: Transaction | null;
  fare: number | null;
}

export interface FingerprintEnrollmentSession {
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
  user: User | null;
  device: HardwareDevice | null;
}

export interface HardwareFingerprintEnrollmentPollResponse {
  pending: boolean;
  pollIntervalMs: number;
  enrollmentId: string | null;
  userId: number | null;
  userName: string | null;
  fingerprintId: number | null;
  deviceId: string | null;
  message: string | null;
}

export interface AuthSession {
  token: string;
  user: User;
  wallet: Wallet;
  fingerprint: Fingerprint | null;
  requiresEnrollment: boolean;
}

export interface UserSummary extends User {
  walletBalance: number;
  fingerprintEnrolled: boolean;
  lastActivityAt: string | null;
}

export interface TripLog extends Trip {
  user: User;
}

export interface WalletSummary {
  user: User;
  wallet: Wallet;
  fingerprint: Fingerprint | null;
  activeTrip: Trip | null;
}

export interface AdminStats {
  activeTrips: number;
  revenue: number;
  passengerCount: number;
  activeUsers: number;
  totalUsers: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Internet of Everything (IoE) additions.
 *
 * These types support the People / Process / Data / Things pillars layered on
 * top of the existing biometric ticketing core:
 *   - People  -> passenger + guardian notifications
 *   - Process -> automated alerts, maintenance tickets, scheduled tasks
 *   - Data    -> revenue, congestion, and anomaly analytics
 *   - Things  -> hardware device health + maintenance
 */

export type NotificationAudience = "USER" | "ADMIN" | "GUARDIAN";

export type NotificationCategory =
  | "TRIP"
  | "WALLET"
  | "SECURITY"
  | "MAINTENANCE"
  | "SYSTEM"
  | "GUARDIAN";

export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface Notification {
  id: number;
  userId: number;
  audience: NotificationAudience;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export interface Guardian {
  id: number;
  userId: number;
  name: string;
  mobile: string;
  email: string | null;
  relationship: string | null;
  notifyOnTrip: boolean;
  notifyOnLowBalance: boolean;
  lowBalanceThreshold: number;
  createdAt: string;
}

export type MaintenanceCategory = "SENSOR" | "GATE" | "NETWORK" | "GENERAL";

export type MaintenanceSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type MaintenanceStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export type MaintenanceSource = "AUTO" | "MANUAL";

export interface MaintenanceTicket {
  id: number;
  deviceId: string | null;
  station: Station | null;
  category: MaintenanceCategory;
  severity: MaintenanceSeverity;
  status: MaintenanceStatus;
  title: string;
  description: string;
  source: MaintenanceSource;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export type CongestionLevel = "LOW" | "MODERATE" | "HIGH" | "SEVERE";

export interface RevenueByDay {
  date: string;
  revenue: number;
  trips: number;
}

export interface RevenueByStation {
  stationId: number;
  stationCode: string;
  stationName: string;
  revenue: number;
  taps: number;
}

export interface RevenueAnalytics {
  totalRevenue: number;
  totalTrips: number;
  averageFare: number;
  last7Days: RevenueByDay[];
  topStations: RevenueByStation[];
}

export interface StationCongestion {
  stationId: number;
  stationCode: string;
  stationName: string;
  zone: number;
  activeTrips: number;
  recentTaps: number;
  predictedNextHourTaps: number;
  congestionLevel: CongestionLevel;
}

export interface CongestionForecast {
  generatedAt: string;
  windowMinutes: number;
  networkLoad: CongestionLevel;
  stations: StationCongestion[];
}

export type AnomalyType =
  | "STALE_TRIP"
  | "RAPID_TAPS"
  | "NEGATIVE_BALANCE"
  | "FARE_SPIKE"
  | "DEVICE_SILENT";

export interface AnomalyRecord {
  type: AnomalyType;
  severity: NotificationSeverity;
  message: string;
  reference: string | null;
  detectedAt: string;
}

export interface AnomalyReport {
  generatedAt: string;
  anomalies: AnomalyRecord[];
}

export type IoePillar = "PEOPLE" | "PROCESS" | "DATA" | "THINGS";

export interface IoePillarStatus {
  pillar: IoePillar;
  label: string;
  healthy: boolean;
  metric: number;
  detail: string;
}

export interface IoeSystemOverview {
  system: string;
  version: string;
  generatedAt: string;
  pillars: IoePillarStatus[];
  revenue: RevenueAnalytics;
  congestion: CongestionForecast;
  anomalies: AnomalyReport;
  openMaintenanceTickets: number;
  unreadAdminNotifications: number;
}
