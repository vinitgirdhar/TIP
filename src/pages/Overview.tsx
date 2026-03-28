import React, { useEffect, useState } from "react";
import { TrendingUp, Database, Activity } from "lucide-react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { cn, formatCurrency, formatDateTime } from "../lib/utils";
import type { AdminStats, PaginatedResponse, TripLog } from "../shared/types";

export function Overview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
  const [liveTrips, setLiveTrips] = useState<TripLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      const [statsResponse, tripsResponse, liveTripsResponse] = await Promise.all([
        api.get<AdminStats>("/api/admin/stats"),
        api.get<PaginatedResponse<TripLog>>("/api/admin/trips?page=1&pageSize=6"),
        api.get<TripLog[]>("/api/admin/trips/live"),
      ]);

      setStats(statsResponse);
      setTripLogs(tripsResponse.data);
      setLiveTrips(liveTripsResponse);
      setError(null);
    } catch (dashboardError) {
      setError(dashboardError instanceof Error ? dashboardError.message : "Failed to load overview.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();

    const intervalId = window.setInterval(() => {
      void loadDashboard();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="p-6 lg:p-12 space-y-10 lg:space-y-12">
      {error ? (
        <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-3">
        <div className="bg-surface-container-highest p-8 border-r border-outline-variant/20">
          <label className="font-sans text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant block mb-4">
            Active Trips (Live)
          </label>
          <div className="flex items-baseline gap-4">
            <span className="text-5xl font-black font-headline text-primary tracking-tighter">
              {stats?.activeTrips ?? 0}
            </span>
            <span className="text-error font-bold text-sm flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              {liveTrips.length} tracked
            </span>
          </div>
          <div className="mt-8 h-1 w-full bg-outline-variant/20">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (stats?.activeTrips || 0) * 8)}%` }}
              className="h-full bg-primary"
            />
          </div>
        </div>

        <div className="bg-surface-container-high p-8 border-r border-outline-variant/20">
          <label className="font-sans text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant block mb-4">
            Total Revenue
          </label>
          <div className="flex items-baseline gap-4">
            <span className="text-5xl font-black font-headline text-primary tracking-tighter">
              {formatCurrency(stats?.revenue ?? 0)}
            </span>
            <span className="text-on-surface-variant font-bold text-sm flex items-center">
              <Database className="w-4 h-4 mr-1" />
              Real
            </span>
          </div>
          <p className="mt-8 font-sans text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
            Passenger count: {stats?.passengerCount ?? 0}
          </p>
        </div>

        <div className="bg-surface-container-low p-8">
          <label className="font-sans text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant block mb-4">
            Passenger Activity
          </label>
          <div className="flex items-baseline gap-4">
            <span className="text-5xl font-black font-headline text-primary tracking-tighter">
              {stats?.activeUsers ?? 0}
            </span>
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div className="mt-8 flex items-end gap-1 h-10">
            {[stats?.activeUsers || 0, stats?.passengerCount || 0, tripLogs.length, liveTrips.length, stats?.totalUsers || 0].map(
              (value, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(10, Math.min(100, value * 10))}%` }}
                  className="w-4 bg-primary"
                />
              ),
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
        <div className="lg:col-span-3 space-y-6">
          <div className="flex justify-between items-end border-b-2 border-primary pb-2">
            <h3 className="text-xl font-black uppercase tracking-widest text-primary">Live Trip Logs</h3>
            <span className="font-sans text-[10px] font-bold uppercase text-on-surface-variant">
              Auto-refresh every 10s
            </span>
          </div>

          <div className="overflow-hidden">
            <table className="w-full text-left border-separate border-spacing-y-1">
              <thead>
                <tr className="bg-surface-container-highest">
                  {["Timestamp", "User Identifier", "Station Node", "Fare (INR)", "Protocol"].map((heading) => (
                    <th
                      key={heading}
                      className="p-4 font-sans text-[10px] font-black uppercase tracking-widest text-on-surface-variant"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-sans text-sm">
                {isLoading ? (
                  <tr className="bg-surface-container-low">
                    <td className="p-4 text-on-surface-variant" colSpan={5}>
                      Loading dashboard logs...
                    </td>
                  </tr>
                ) : tripLogs.length ? (
                  tripLogs.map((log, index) => (
                    <tr
                      key={log.id}
                      className={cn(
                        "ledger-row",
                        index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container-high",
                      )}
                    >
                      <td className="p-4 font-bold text-primary">{formatDateTime(log.entryTime)}</td>
                      <td className="p-4">
                        <div className="font-black">{log.user.govId}</div>
                        <div className="text-[10px] text-on-surface-variant">{log.user.fullName}</div>
                      </td>
                      <td className="p-4">
                        {log.entryStation.code} -&gt; {log.exitStation?.code || "IN TRANSIT"}
                      </td>
                      <td className="p-4 text-right font-black">
                        {log.fare == null ? "Pending" : formatCurrency(log.fare)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={cn(
                            "text-[10px] px-2 py-1 font-black",
                            log.status === "IN_TRANSIT" ? "bg-primary/10 text-primary" : "bg-error/10 text-error",
                          )}
                        >
                          {log.status === "IN_TRANSIT" ? "ENTRY" : "EXIT"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-surface-container-low">
                    <td className="p-4 text-on-surface-variant" colSpan={5}>
                      No trip activity recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-primary p-6 text-white">
            <h4 className="font-headline text-lg font-black uppercase tracking-widest mb-6">System Health</h4>
            <div className="space-y-4">
              {[
                { label: "Biometric Mesh", status: "bg-green-400", value: `${liveTrips.length} live scans` },
                { label: "Transaction Bus", status: "bg-green-400", value: `${stats?.revenue ? "SETTLED" : "IDLE"}` },
                { label: "Passenger Core", status: "bg-yellow-400", value: `${stats?.activeUsers ?? 0} active users` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <div>
                    <span className="font-sans text-[11px] font-bold uppercase block">{item.label}</span>
                    <span className="text-[10px] opacity-60">{item.value}</span>
                  </div>
                  <div className={cn("w-3 h-3", item.status)} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-highest p-6">
            <h4 className="font-headline text-[12px] font-black uppercase tracking-widest mb-4">Security Advisory</h4>
            <p className="font-sans text-xs text-on-surface-variant leading-relaxed">
              Wallet mutations, fingerprint enrollment, and fare deductions are now backed by SQLite transactions. Active
              user pool currently stands at <span className="font-bold text-primary">{stats?.activeUsers ?? 0}</span>.
            </p>
            <button className="mt-6 w-full py-3 bg-primary text-white font-sans text-[10px] font-black uppercase tracking-widest">
              Acknowledge Alert
            </button>
          </div>

          <div className="relative w-full aspect-square bg-surface-container-lowest overflow-hidden">
            <img
              src="https://picsum.photos/seed/monolith-topology/800/800?grayscale"
              alt="Network Topology"
              className="w-full h-full object-cover opacity-50 grayscale contrast-125"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-t from-primary to-transparent">
              <span className="font-headline text-2xl font-black text-white leading-none">
                NETWORK
                <br />
                TOPOLOGY
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
