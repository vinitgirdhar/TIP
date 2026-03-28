import React from "react";
import { User } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const TITLES: Record<string, string> = {
  "/overview": "Operations Overview",
  "/users": "User Management",
  "/portal": "Biometric Wallet",
  "/tap": "Tap Simulator",
  "/logs": "Trip Logs",
};

export function Header() {
  const location = useLocation();
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <header className="hidden lg:flex h-20 px-12 justify-between items-center bg-surface-container-low border-b border-outline-variant/10">
      <div>
        <h2 className="text-2xl font-black text-primary tracking-widest uppercase font-headline">
          {TITLES[location.pathname] || "Monolith Transit"}
        </h2>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Node ID
          </span>
          <span className="font-sans text-sm font-black text-primary">{user.govId}</span>
        </div>
        <div className="px-3 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em]">
          {user.role}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-black text-primary uppercase">{user.fullName}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{user.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
