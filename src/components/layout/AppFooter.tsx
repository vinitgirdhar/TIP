import React from "react";

export function AppFooter() {
  return (
    <footer className="hidden lg:flex w-full py-6 px-12 flex-col md:flex-row justify-between items-center bg-surface-container-low border-t border-outline-variant/10">
      <div className="font-sans text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4 md:mb-0">
        © 2026 Monolith Infrastructure. Government-grade encryption active.
      </div>
      <nav className="flex gap-8">
        <a
          href="#"
          className="font-sans text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors underline"
        >
          Security Protocols
        </a>
        <a
          href="#"
          className="font-sans text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
        >
          System Status: 99.9%
        </a>
        <a
          href="#"
          className="font-sans text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
        >
          Privacy Ledger
        </a>
      </nav>
    </footer>
  );
}
