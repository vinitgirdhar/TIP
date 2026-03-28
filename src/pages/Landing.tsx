import React from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, Globe2, ShieldCheck, Wallet } from "lucide-react";

function KioskIllustration() {
  return (
    <div className="relative h-[300px] sm:h-[360px] overflow-hidden bg-gradient-to-b from-white via-[#eef1fb] to-[#d7daf0]">
      <div className="absolute inset-x-0 bottom-5 h-10 bg-primary/10 blur-2xl" />

      <div className="absolute left-1/2 bottom-5 -translate-x-1/2 w-[180px] h-[34px] bg-[#131633] rounded-full opacity-35 blur-[2px]" />

      <div className="absolute left-[18%] bottom-[30px] w-[180px] h-[92px] bg-[#11132e] rounded-[18px] rotate-[4deg] shadow-[0_18px_30px_rgba(6,8,32,0.35)]" />
      <div className="absolute left-[28%] bottom-[86px] w-[118px] h-[176px] bg-[#161937] rounded-[22px] -rotate-[7deg] shadow-[0_22px_34px_rgba(6,8,32,0.38)]" />
      <div className="absolute left-[44%] bottom-[108px] w-[56px] h-[106px] bg-[#101226] rounded-[10px] border border-white/8 -rotate-[7deg]" />
      <div className="absolute left-[47%] bottom-[136px] w-[36px] h-[52px] bg-gradient-to-br from-slate-300 via-slate-500 to-slate-700 rounded-[4px] -rotate-[7deg]" />
      <div className="absolute left-[49%] bottom-[120px] w-[28px] h-[8px] bg-slate-500/25 rounded-full -rotate-[7deg]" />
      <div className="absolute left-[46%] bottom-[112px] w-[46px] h-[12px] flex items-center gap-1 -rotate-[7deg]">
        <div className="w-[10px] h-[10px] rounded-full border border-white/25" />
        <div className="w-[14px] h-[3px] bg-white/20 rounded-full" />
      </div>
      <div className="absolute left-[37%] bottom-[46px] w-[92px] h-[10px] bg-white/6 rounded-full rotate-[4deg]" />

      <div className="absolute left-3 bottom-3 bg-primary text-white px-3 py-2 flex items-center gap-2 shadow-[0_10px_20px_rgba(0,6,102,0.3)]">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span className="text-[10px] font-black uppercase tracking-[0.18em]">Identity Verified</span>
      </div>
    </div>
  );
}

const moduleCards = [
  {
    icon: Fingerprint,
    tag: "Secure",
    title: "Biometric Authentication",
    description:
      "Multi-point iris and palm-vein recognition protocols ensuring 99.9% entry accuracy without physical media.",
  },
  {
    icon: Wallet,
    tag: "Sovereign",
    title: "Digital Wallet",
    description:
      "Centralized ledger for all transit credits, auto-renewals, and corporate expenditure tracking with real-time settlement.",
  },
  {
    icon: Globe2,
    tag: "Global",
    title: "Universal Access",
    description:
      "One identity for every major transit hub across 140+ participating smart cities and private networks.",
  },
];

const networkStats = [
  { label: "Latency", value: "14ms" },
  { label: "Uptime", value: "99.9%" },
  { label: "Cities", value: "142" },
  { label: "Users", value: "2.4M" },
];

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="bg-surface">
      <section className="px-5 pt-5 pb-8 lg:px-12 lg:pt-16 lg:pb-14">
        <div className="mx-auto max-w-7xl grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center">
          <div className="order-1 space-y-8">
            <div className="space-y-6">
              <p className="text-[10px] font-black uppercase tracking-[0.38em] text-primary">Infrastructure V4.0</p>
              <h1 className="text-[3.45rem] leading-[0.9] font-black text-primary uppercase tracking-[-0.06em] sm:text-[4.3rem] lg:text-[6.4rem]">
                No Card,
                <br />
                No Phone,
                <br />
                No Friction.
              </h1>
              <p className="max-w-xl text-[1.02rem] leading-9 text-on-surface/90 sm:text-[1.1rem]">
                Access the global transit network through sovereign biometric identity. Your body is the only
                credential required.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => navigate("/register")}
                className="w-full sm:w-auto min-w-[220px] bg-primary text-white px-8 py-5 font-black uppercase tracking-[0.2em]"
              >
                Get Started
              </button>
              <button
                onClick={() => navigate("/login")}
                className="hidden lg:inline-flex border-2 border-primary text-primary px-8 py-5 font-black uppercase tracking-[0.2em]"
              >
                Infrastructure View
              </button>
            </div>
          </div>

          <div className="order-2 bg-white p-3 sm:p-5 shadow-[0_18px_40px_rgba(8,19,84,0.06)]">
            <KioskIllustration />
          </div>
        </div>
      </section>

      <section id="modules" className="px-5 pb-10 lg:px-12 lg:pb-16">
        <div className="mx-auto max-w-7xl">
          <div className="pl-4 border-l-4 border-primary mb-8 lg:mb-10">
            <h2 className="text-[2rem] leading-none font-black text-primary uppercase tracking-[-0.04em]">
              System Modules
            </h2>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.26em] text-on-surface-variant">
              Core Infrastructure Features
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {moduleCards.map((card) => (
              <article key={card.title} className="bg-surface-container-low px-6 py-7 lg:px-8 lg:py-9">
                <div className="flex items-start justify-between gap-4 mb-12">
                  <card.icon className="w-6 h-6 text-primary" />
                  <span className="bg-primary/6 text-primary text-[10px] font-black uppercase tracking-[0.18em] px-3 py-1.5">
                    {card.tag}
                  </span>
                </div>
                <h3 className="text-[2rem] leading-none font-black text-primary uppercase tracking-[-0.04em]">
                  {card.title}
                </h3>
                <p className="mt-4 text-[0.98rem] leading-8 text-on-surface-variant">{card.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="status" className="px-5 pb-10 lg:px-12 lg:pb-20">
        <div className="mx-auto max-w-7xl bg-primary text-white px-7 py-8 lg:px-10 lg:py-10">
          <div className="mb-8 lg:mb-10">
            <h2 className="text-[2rem] leading-none font-black uppercase tracking-[-0.04em]">Network Status</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-10">
            {networkStats.map((stat) => (
              <div key={stat.label}>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/65">{stat.label}</p>
                <p className="mt-2 text-[2.35rem] leading-none font-black tracking-[-0.05em]">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
