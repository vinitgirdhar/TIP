export type UserRole = "ADMIN" | "USER";

export type UserStatus = "ACTIVE" | "PENDING" | "SUSPENDED";

export type TripStatus = "IN_TRANSIT" | "COMPLETED";

export type TransactionType = "RECHARGE" | "FARE_DEDUCTION" | "ADMIN_ALLOCATION";

export interface User {
  id: number;
  fullName: string;
  govId: string;
  email: string;
  mobile: string;
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

