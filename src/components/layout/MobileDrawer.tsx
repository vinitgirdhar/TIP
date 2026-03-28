import React from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import type { User } from "../../shared/types";
import type { NavItem } from "./navItems";

interface MobileDrawerProps {
  isOpen: boolean;
  items: NavItem[];
  user: User | null;
  onClose: () => void;
  onLogout?: () => void;
}

export function MobileDrawer({ isOpen, items, user, onClose, onLogout }: MobileDrawerProps) {
  return (
    <div
      className={cn(
        "lg:hidden fixed inset-0 z-[60] transition-opacity duration-200",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      )}
    >
      <button
        onClick={onClose}
        className="absolute inset-0 bg-primary/35"
        type="button"
        aria-label="Close navigation drawer"
      />

      <aside
        className={cn(
          "relative z-10 h-full w-[84%] max-w-[320px] bg-surface px-6 py-6 flex flex-col gap-8 transition-transform duration-200",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary text-sm font-black uppercase tracking-[0.35em]">Monolith</p>
            <p className="text-primary text-sm font-black uppercase tracking-[0.35em] mt-1">Transit</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-primary" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-surface-container-low p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant mb-2">
            {user ? user.role : "Public Access"}
          </p>
          <p className="text-base font-black text-primary uppercase">{user?.fullName || "Transit Interface"}</p>
          <p className="text-xs text-on-surface-variant mt-2">
            {user ? user.email : "Biometric-first mobility infrastructure"}
          </p>
        </div>

        <nav className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className="bg-surface-container-low px-4 py-4 flex items-center gap-3 text-primary font-black uppercase tracking-[0.16em]"
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          {user ? (
            <button
              onClick={() => {
                onLogout?.();
                onClose();
              }}
              className="w-full bg-primary text-white py-4 font-black uppercase tracking-[0.18em]"
              type="button"
            >
              Logout
            </button>
          ) : (
            <>
              <Link
                to="/register"
                onClick={onClose}
                className="block w-full bg-primary text-white py-4 text-center font-black uppercase tracking-[0.18em]"
              >
                Get Started
              </Link>
              <Link
                to="/login"
                onClick={onClose}
                className="block w-full border border-primary py-4 text-center text-primary font-black uppercase tracking-[0.18em]"
              >
                Infrastructure View
              </Link>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
