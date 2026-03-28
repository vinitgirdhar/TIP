import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Fingerprint, MapPin, ArrowRightLeft } from "lucide-react";
import { api } from "../lib/api";
import { formatCurrency, formatElapsedTime } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import type { Station, Transaction, Trip, Wallet } from "../shared/types";

interface TripExitReceipt {
  trip: Trip;
  wallet: Wallet;
  transaction: Transaction;
  fare: number;
}

export function TapSimulator() {
  const { refreshUser } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [receipt, setReceipt] = useState<TripExitReceipt | null>(null);
  const [entryStationId, setEntryStationId] = useState("");
  const [exitStationId, setExitStationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTapState = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [stationsResponse, activeTripResponse] = await Promise.all([
        api.get<Station[]>("/api/stations"),
        api.get<{ trip: Trip | null }>("/api/trips/active"),
      ]);

      setStations(stationsResponse);
      setActiveTrip(activeTripResponse.trip);
      setReceipt(null);
      setEntryStationId((current) => current || String(stationsResponse[0]?.id || ""));
      setExitStationId("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tap simulator.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTapState();
  }, []);

  const handleTapIn = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<{ trip: Trip }>("/api/trips/entry", { stationId: Number(entryStationId) });
      setActiveTrip(response.trip);
      setReceipt(null);
      setExitStationId("");
      await refreshUser();
    } catch (tapError) {
      setError(tapError instanceof Error ? tapError.message : "Tap in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTapOut = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<TripExitReceipt>("/api/trips/exit", { stationId: Number(exitStationId) });
      setActiveTrip(null);
      setReceipt(response);
      await refreshUser();
    } catch (tapError) {
      setError(tapError instanceof Error ? tapError.message : "Tap out failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-sm font-bold text-on-surface-variant">Loading tap simulator...</div>;
  }

  return (
    <div className="p-8 lg:p-12 space-y-10">
      <header className="flex flex-col gap-2">
        <span className="text-primary font-bold text-xs uppercase tracking-[0.3em]">Transit Control</span>
        <h2 className="text-5xl font-black text-primary tracking-tighter uppercase">Tap In / Out</h2>
      </header>

      {error ? (
        <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
      ) : null}

      <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        <div className="bg-surface-container-low p-10 space-y-8">
          {!activeTrip && !receipt ? (
            <>
              <div className="flex justify-between items-end border-b-2 border-primary pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-2">
                    Entry Mode
                  </p>
                  <h3 className="text-3xl font-black text-primary uppercase tracking-tight">Initialize Trip</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Biometric Gate
                </span>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Select Entry Station
                </label>
                <select
                  value={entryStationId}
                  onChange={(event) => setEntryStationId(event.target.value)}
                  className="w-full bg-surface-container-high p-4 font-bold outline-none"
                >
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name} · Zone {station.zone}
                    </option>
                  ))}
                </select>
              </div>

              <button
                disabled={isSubmitting || !entryStationId}
                onClick={handleTapIn}
                className="bg-primary text-white px-10 py-4 font-black uppercase tracking-[0.2em] disabled:opacity-60"
                type="button"
              >
                Tap In
              </button>
            </>
          ) : null}

          {activeTrip ? (
            <>
              <div className="flex justify-between items-end border-b-2 border-primary pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-2">
                    In Transit
                  </p>
                  <h3 className="text-3xl font-black text-primary uppercase tracking-tight">
                    {activeTrip.entryStation.name}
                  </h3>
                </div>
                <span className="text-lg font-black text-primary">{formatElapsedTime(activeTrip.entryTime)}</span>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Entry Node
                  </p>
                  <p className="text-xl font-black text-primary uppercase">{activeTrip.entryStation.code}</p>
                  <p className="text-sm font-bold text-on-surface-variant">{activeTrip.entryStation.name}</p>
                </div>
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Trip Status
                  </p>
                  <p className="text-xl font-black text-primary uppercase">{activeTrip.status.replace("_", " ")}</p>
                  <p className="text-sm font-bold text-on-surface-variant">Awaiting destination exit node.</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Select Exit Station
                </label>
                <select
                  value={exitStationId}
                  onChange={(event) => setExitStationId(event.target.value)}
                  className="w-full bg-surface-container-high p-4 font-bold outline-none"
                >
                  <option value="">Choose exit station</option>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name} · Zone {station.zone}
                    </option>
                  ))}
                </select>
              </div>

              <button
                disabled={isSubmitting || !exitStationId}
                onClick={handleTapOut}
                className="bg-primary text-white px-10 py-4 font-black uppercase tracking-[0.2em] disabled:opacity-60"
                type="button"
              >
                Tap Out
              </button>
            </>
          ) : null}

          {receipt ? (
            <>
              <div className="flex justify-between items-end border-b-2 border-primary pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-2">
                    Exit Receipt
                  </p>
                  <h3 className="text-3xl font-black text-primary uppercase tracking-tight">Fare Settled</h3>
                </div>
                <span className="text-2xl font-black text-primary">{formatCurrency(receipt.fare)}</span>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Entry
                  </p>
                  <p className="font-black text-primary uppercase">{receipt.trip.entryStation.code}</p>
                </div>
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Exit
                  </p>
                  <p className="font-black text-primary uppercase">{receipt.trip.exitStation?.code}</p>
                </div>
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Balance
                  </p>
                  <p className="font-black text-primary">{formatCurrency(receipt.wallet.balance)}</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setReceipt(null);
                  setExitStationId("");
                }}
                className="border-2 border-primary text-primary px-10 py-4 font-black uppercase tracking-[0.2em]"
                type="button"
              >
                Start Another Trip
              </button>
            </>
          ) : null}
        </div>

        <aside className="bg-primary-container text-white p-10 flex flex-col justify-between overflow-hidden relative">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.3, 0.15] }}
            transition={{ repeat: Infinity, duration: 2.4 }}
            className="absolute -right-20 -top-16"
          >
            <Fingerprint className="w-72 h-72" />
          </motion.div>

          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-3">Biometric Sync</p>
            <h3 className="text-4xl font-black uppercase tracking-tight leading-none">Fingerprint Gate Pulse</h3>
          </div>

          <div className="relative z-10 space-y-4">
            <div className="bg-white/10 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest">Current Mode</span>
                <span className="text-xs font-black bg-white text-primary px-2 py-1">
                  {receipt ? "RECEIPT" : activeTrip ? "EXIT" : "ENTRY"}
                </span>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5" />
                <span className="text-sm font-bold">10 seeded stations connected across 5 fare zones.</span>
              </div>
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="w-5 h-5" />
                <span className="text-sm font-bold">Fare is computed on exit from actual zone difference.</span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

