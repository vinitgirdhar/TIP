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
