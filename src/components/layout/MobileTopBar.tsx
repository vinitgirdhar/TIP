import React from "react";
import { LogOut, Menu, User } from "lucide-react";
import type { User as TransitUser } from "../../shared/types";

interface MobileTopBarProps {
  user: TransitUser | null;
  showMenuButton?: boolean;
  onMenuClick: () => void;
  onLogout?: () => void;
}

export function MobileTopBar({ user, showMenuButton = true, onMenuClick, onLogout }: MobileTopBarProps) {
  return (
    <header className="lg:hidden fixed top-0 inset-x-0 z-50 h-[76px] bg-surface/96 backdrop-blur border-b border-outline-variant/20">
      <div className="h-full px-5 flex items-center justify-between gap-4">
        {showMenuButton ? (
          <button
            onClick={onMenuClick}
            className="w-10 h-10 flex items-center justify-center text-primary"
            type="button"
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        ) : null}

        <div className="mr-auto">
          <p className="text-primary text-[0.92rem] font-black uppercase tracking-[0.42em] leading-none">Monolith</p>
          <p className="text-primary text-[0.92rem] font-black uppercase tracking-[0.42em] leading-none mt-1">
            Transit
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user && !showMenuButton && onLogout ? (
            <button
              onClick={onLogout}
              className="w-10 h-10 flex items-center justify-center text-primary"
              type="button"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          ) : null}

          <div className="w-10 h-10 rounded-full bg-primary-container/10 border border-primary/10 flex items-center justify-center overflow-hidden">
            {user ? (
              <span className="text-primary text-sm font-black uppercase">{user.fullName.slice(0, 1)}</span>
            ) : (
              <User className="w-5 h-5 text-primary" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
