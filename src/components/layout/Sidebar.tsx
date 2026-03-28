import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Activity, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "../../lib/utils";
import { getShellNavItems } from "./navItems";

export function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  const navItems = getShellNavItems(user.role);

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-surface flex-col border-r border-outline-variant/20 z-50">
      <div className="p-8">
        <h1 className="text-xl font-black text-primary tracking-widest uppercase leading-none">
          {user.role === "ADMIN" ? "System Admin" : "Wallet User"}
        </h1>
        <p className="font-sans font-bold text-[10px] uppercase tracking-wider text-on-surface-variant mt-1">
          {user.role === "ADMIN" ? "Level 4 Clearance" : "Active Transit Profile"}
        </p>
      </div>

      <nav className="flex-grow mt-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center px-8 py-4 font-sans font-bold text-sm uppercase tracking-wider transition-all duration-200",
                    isActive
                      ? "bg-primary text-white"
                      : "text-on-surface-variant hover:bg-surface-container-low hover:pl-10",
                  )
                }
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-8 space-y-6">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
          <div className="w-2 h-2 bg-green-500 animate-pulse" />
          System Status: Active
        </div>

        <ul className="space-y-2">
          <li>
            <button className="flex items-center text-on-surface-variant hover:text-primary transition-colors font-sans font-bold text-[11px] uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 mr-2" />
              {user.role === "ADMIN" ? "Security Settings" : "Identity Shield"}
            </button>
          </li>
          <li>
            <button
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="flex items-center text-on-surface-variant hover:text-primary transition-colors font-sans font-bold text-[11px] uppercase tracking-wider"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </button>
          </li>
        </ul>

        <div className="bg-surface-container-low p-4">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Profile</span>
          </div>
          <p className="text-xs font-black uppercase">{user.fullName}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{user.status}</p>
        </div>
      </div>
    </aside>
  );
}
