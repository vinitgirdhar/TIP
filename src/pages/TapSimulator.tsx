import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRightLeft, Fingerprint, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { formatCurrency, formatElapsedTime } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import type { HardwareFingerprintVerificationResponse, Trip } from "../shared/types";

type GateMode = "ENTRY" | "EXIT" | "AUTO";

const GATE_DEVICE_IDS: Record<GateMode, string> = {
  ENTRY: "gate_entry_01",
  EXIT: "gate_exit_01",
  AUTO: "gate_01",
};

const GATE_MODE_LABELS: Record<GateMode, string> = {
  ENTRY: "Tap In",
  EXIT: "Tap Out",
  AUTO: "Auto",
};

const GATE_MODE_DESCRIPTIONS: Record<GateMode, string> = {
  ENTRY: "Use this for starting a trip.",
  EXIT: "Use this for closing a trip.",
  AUTO: "Use this for desk testing with automatic in/out resolution.",
};

export function TapSimulator() {
  const { user, refreshUser } = useAuth();
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [receipt, setReceipt] = useState<HardwareFingerprintVerificationResponse | null>(null);
  const [gateMode, setGateMode] = useState<GateMode>("ENTRY");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedDeviceId = GATE_DEVICE_IDS[gateMode];
  const selectedModeLabel = GATE_MODE_LABELS[gateMode];

  const loadTapState = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const activeTripResponse = await api.get<{ trip: Trip | null }>("/api/trips/active");
      setActiveTrip(activeTripResponse.trip);
      setReceipt(null);
      setGateMode(activeTripResponse.trip ? "EXIT" : "ENTRY");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tap simulator.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTapState();
  }, []);

  const handleGateScan = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (!user?.fingerprintId) {
        throw new Error("Enroll your fingerprint first. This page uses the linked fingerprint automatically.");
      }

      const response = await api.post<HardwareFingerprintVerificationResponse>("/api/fingerprint/verify", {
        fingerprint_id: user.fingerprintId,
        device_id: selectedDeviceId,
      });

      if (response.action === "TAP_IN") {
        setActiveTrip(response.trip);
        setReceipt(null);
        setGateMode("EXIT");
      } else if (response.action === "TAP_OUT") {
        setActiveTrip(null);
        setReceipt(response);
        setGateMode("ENTRY");
      } else {
        throw new Error(response.reason || response.message || "Fingerprint scan failed.");
      }

      await refreshUser();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Fingerprint scan failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetTrip = () => {
    setReceipt(null);
    setError(null);
    setGateMode("ENTRY");
  };

  if (isLoading) {
    return <div className="p-12 text-sm font-bold text-on-surface-variant">Loading tap simulator...</div>;
  }

  return (
    <div className="p-6 lg:p-12 space-y-10">
      <header className="flex flex-col gap-2">
        <span className="text-primary font-bold text-xs uppercase tracking-[0.3em]">Transit Control</span>
        <h2 className="text-5xl font-black text-primary tracking-tighter uppercase">Fingerprint Gate</h2>
      </header>

      {error ? (
        <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
      ) : null}

      <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        <div className="bg-surface-container-low p-6 lg:p-10 space-y-8">
          <div className="flex flex-col gap-4 border-b-2 border-primary pb-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-2">
                  Gate Mode
                </p>
                <h3 className="text-3xl font-black text-primary uppercase tracking-tight">
                  {activeTrip ? "Trip In Progress" : "Gate Ready"}
                </h3>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Biometric Gate
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["ENTRY", "EXIT", "AUTO"] as GateMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGateMode(mode)}
                  className={`px-4 py-3 text-xs font-black uppercase tracking-[0.2em] border-2 transition-colors ${
                    gateMode === mode
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-primary border-primary/20 hover:border-primary"
                  }`}
                  type="button"
                >
                  {GATE_MODE_LABELS[mode]}
                </button>
              ))}
            </div>

            <p className="text-sm font-bold text-on-surface-variant">{GATE_MODE_DESCRIPTIONS[gateMode]}</p>
          </div>

          <div className="bg-surface-container-high p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
              Enrolled Fingerprint ID
            </p>
            <p className="text-xl font-black text-primary uppercase">{user?.fingerprintId ?? "Not Enrolled"}</p>
            <p className="text-sm font-bold text-on-surface-variant">
              Tap Out is visible as a dedicated mode, so you can switch the gate without hiding the exit path.
            </p>
          </div>

          <div className="bg-surface-container-high p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
              Active Gate Device
            </p>
            <p className="text-xl font-black text-primary uppercase">{selectedDeviceId}</p>
            <p className="text-sm font-bold text-on-surface-variant">
              {gateMode === "AUTO"
                ? "AUTO mode resolves tap in/out from the trip state."
                : gateMode === "EXIT"
                  ? "EXIT mode sends the scan as a tap out."
                  : "ENTRY mode sends the scan as a tap in."}
            </p>
          </div>

          {activeTrip ? (
            <div className="bg-surface-container-high p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Current Trip</p>
              <p className="text-xl font-black text-primary uppercase">{activeTrip.entryStation.name}</p>
              <p className="text-sm font-bold text-on-surface-variant">
                Started at {formatElapsedTime(activeTrip.entryTime)}. Switch to Tap Out when the ride is complete.
              </p>
            </div>
          ) : null}

          {!activeTrip && gateMode === "EXIT" ? (
            <div className="bg-surface-container-high p-5 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Tap Out Preview
              </p>
              <p className="text-sm font-bold text-on-surface-variant">
                Tap Out is available now, but it will only succeed after a trip has been started.
              </p>
            </div>
          ) : null}

          <button
            disabled={isSubmitting || !user?.fingerprintId}
            onClick={handleGateScan}
            className="bg-primary text-white px-10 py-4 font-black uppercase tracking-[0.2em] disabled:opacity-60"
            type="button"
          >
            Scan Fingerprint for {selectedModeLabel}
          </button>

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
                  <p className="text-sm font-bold text-on-surface-variant">Tap Out is waiting on the exit gate.</p>
                </div>
              </div>
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
                <span className="text-2xl font-black text-primary">{formatCurrency(receipt.fare || 0)}</span>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Entry
                  </p>
                  <p className="font-black text-primary uppercase">{receipt.trip?.entryStation.code}</p>
                </div>
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Exit
                  </p>
                  <p className="font-black text-primary uppercase">{receipt.trip?.exitStation?.code}</p>
                </div>
                <div className="bg-surface-container-high p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Balance
                  </p>
                  <p className="font-black text-primary">{formatCurrency(receipt.wallet?.balance ?? 0)}</p>
                </div>
              </div>

              <div className="bg-surface-container-high p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Gate Device
                </p>
                <p className="text-xl font-black text-primary uppercase">{receipt.device?.deviceId || selectedDeviceId}</p>
                <p className="text-sm font-bold text-on-surface-variant">{receipt.message}</p>
              </div>

              <button
                onClick={handleResetTrip}
                className="border-2 border-primary text-primary px-10 py-4 font-black uppercase tracking-[0.2em]"
                type="button"
              >
                Start Another Trip
              </button>
            </>
          ) : null}
        </div>

        <aside className="bg-primary-container text-white p-6 lg:p-10 flex flex-col justify-between overflow-hidden relative">
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
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase tracking-widest">Current Mode</span>
                <span className="text-xs font-black bg-white text-primary px-2 py-1">{selectedModeLabel}</span>
              </div>
            </div>
            <div className="bg-white/10 p-5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase tracking-widest">Current Device</span>
                <span className="text-xs font-black bg-white text-primary px-2 py-1">{selectedDeviceId}</span>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5" />
                <span className="text-sm font-bold">Tap Out is now a first-class mode on the page and the board.</span>
              </div>
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="w-5 h-5" />
                <span className="text-sm font-bold">Auto mode still works for desk testing when you do not want to pick a direction.</span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
