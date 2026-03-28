import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import type { PaginatedResponse, Station, Trip, TripLog } from "../shared/types";

type TripRecord = Trip | TripLog;

export function TripLogs() {
  const { user } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [trips, setTrips] = useState<PaginatedResponse<TripRecord> | null>(null);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    stationId: "",
    page: 1,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrips = async (nextFilters = filters) => {
    if (!user) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        page: String(nextFilters.page),
        pageSize: "10",
      });

      if (nextFilters.from) {
        query.set("from", nextFilters.from);
      }
      if (nextFilters.to) {
        query.set("to", nextFilters.to);
      }
      if (nextFilters.stationId) {
        query.set("stationId", nextFilters.stationId);
      }

      const [stationsResponse, tripsResponse] = await Promise.all([
        stations.length ? Promise.resolve(stations) : api.get<Station[]>("/api/stations"),
        api.get<PaginatedResponse<TripRecord>>(
          `${user.role === "ADMIN" ? "/api/admin/trips" : "/api/trips"}?${query.toString()}`,
        ),
      ]);

      setStations(stationsResponse);
      setTrips(tripsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load trip logs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTrips();
  }, [user]);

  const handleFilterChange = (field: keyof typeof filters, value: string | number) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      page: field === "page" ? Number(value) : 1,
    }));
  };

  const applyFilters = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadTrips({ ...filters, page: 1 });
  };

  return (
    <div className="p-8 lg:p-12 space-y-10">
      <header className="flex flex-col gap-2">
        <span className="text-primary font-bold text-xs uppercase tracking-[0.3em]">Trip Intelligence</span>
        <h2 className="text-5xl font-black text-primary tracking-tighter uppercase">
          {user?.role === "ADMIN" ? "Network Trip Logs" : "My Trip Logs"}
        </h2>
      </header>

      <form onSubmit={applyFilters} className="bg-surface-container-low p-6 grid md:grid-cols-4 gap-4">
        <input
          value={filters.from}
          onChange={(event) => handleFilterChange("from", event.target.value)}
          className="bg-surface-container-high p-4 font-bold outline-none"
          type="date"
        />
        <input
          value={filters.to}
          onChange={(event) => handleFilterChange("to", event.target.value)}
          className="bg-surface-container-high p-4 font-bold outline-none"
          type="date"
        />
        <select
          value={filters.stationId}
          onChange={(event) => handleFilterChange("stationId", event.target.value)}
          className="bg-surface-container-high p-4 font-bold outline-none"
        >
          <option value="">All stations</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>
        <button className="bg-primary text-white px-6 py-4 font-black uppercase tracking-[0.2em]" type="submit">
          Apply Filters
        </button>
      </form>

      {error ? (
        <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
      ) : null}

      <section className="bg-surface-container-low overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-primary text-white">
            <tr>
              {user?.role === "ADMIN" ? <th className="p-5 text-[10px] font-black uppercase tracking-widest">User</th> : null}
              <th className="p-5 text-[10px] font-black uppercase tracking-widest">Entry / Exit</th>
              <th className="p-5 text-[10px] font-black uppercase tracking-widest">Timestamp</th>
              <th className="p-5 text-[10px] font-black uppercase tracking-widest">Status</th>
              <th className="p-5 text-[10px] font-black uppercase tracking-widest text-right">Fare</th>
            </tr>
          </thead>
          <tbody className="text-sm font-bold">
            {isLoading ? (
              <tr>
                <td className="p-6 text-on-surface-variant" colSpan={user?.role === "ADMIN" ? 5 : 4}>
                  Loading trip ledger...
                </td>
              </tr>
            ) : trips?.data.length ? (
              trips.data.map((trip) => {
                const isAdminTrip = "user" in trip;

                return (
                  <tr key={trip.id} className="border-b-4 border-surface bg-surface-container-high">
                    {user?.role === "ADMIN" ? (
                      <td className="p-5">
                        {isAdminTrip ? (
                          <div>
                            <div className="font-black text-primary uppercase">{trip.user.fullName}</div>
                            <div className="text-[10px] text-on-surface-variant">{trip.user.govId}</div>
                          </div>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="p-5">
                      <div className="font-black text-primary uppercase">
                        {trip.entryStation.code} → {trip.exitStation?.code || "IN TRANSIT"}
                      </div>
                      <div className="text-[10px] text-on-surface-variant">
                        {trip.entryStation.name}
                        {trip.exitStation ? ` → ${trip.exitStation.name}` : ""}
                      </div>
                    </td>
                    <td className="p-5 text-on-surface-variant">{formatDateTime(trip.entryTime)}</td>
                    <td className="p-5">
                      <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
                        {trip.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-5 text-right text-primary">{trip.fare == null ? "Pending" : formatCurrency(trip.fare)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="p-6 text-on-surface-variant" colSpan={user?.role === "ADMIN" ? 5 : 4}>
                  No trip records matched the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {trips ? (
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Page {trips.page} of {trips.totalPages} · {trips.total} total trips
          </p>
          <div className="flex gap-3">
            <button
              disabled={trips.page <= 1}
              onClick={() => {
                const nextFilters = { ...filters, page: trips.page - 1 };
                setFilters(nextFilters);
                void loadTrips(nextFilters);
              }}
              className="border border-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-primary disabled:opacity-40"
              type="button"
            >
              Previous
            </button>
            <button
              disabled={trips.page >= trips.totalPages}
              onClick={() => {
                const nextFilters = { ...filters, page: trips.page + 1 };
                setFilters(nextFilters);
                void loadTrips(nextFilters);
              }}
              className="bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
