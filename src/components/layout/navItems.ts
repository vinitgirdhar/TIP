import type { LucideIcon } from "lucide-react";
import { Fingerprint, History, LayoutDashboard, LogIn, UserPlus, Users, Wallet } from "lucide-react";
import type { UserRole } from "../../shared/types";

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
}

export function getShellNavItems(role: UserRole): NavItem[] {
  return role === "ADMIN"
    ? [
        { icon: LayoutDashboard, label: "Overview", path: "/overview" },
        { icon: Users, label: "Users", path: "/users" },
        { icon: History, label: "Logs", path: "/logs" },
      ]
    : [
        { icon: Wallet, label: "Wallet", path: "/portal" },
        { icon: History, label: "Trips", path: "/logs" },
        { icon: Fingerprint, label: "Tap", path: "/tap" },
      ];
}

export const publicMobileNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: UserPlus, label: "Users", path: "/register" },
  { icon: LogIn, label: "Logs", path: "/login" },
];

export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/") {
    return pathname === "/";
  }

  return pathname === itemPath;
}

