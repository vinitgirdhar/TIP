import React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import { isNavItemActive, type NavItem } from "./navItems";

interface MobileBottomNavProps {
  items: NavItem[];
  pathname: string;
}

export function MobileBottomNav({ items, pathname }: MobileBottomNavProps) {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-outline-variant/20">
      <div className="grid grid-cols-3 gap-0">
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item.path);

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={cn(
                "min-h-[74px] flex flex-col items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors",
                isActive ? "bg-primary text-white" : "text-slate-400",
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

