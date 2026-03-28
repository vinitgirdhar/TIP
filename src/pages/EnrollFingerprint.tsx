import React, { useEffect, useState } from "react";
import { Fingerprint, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { Fingerprint as FingerprintType } from "../shared/types";

export function EnrollFingerprint() {
  const navigate = useNavigate();
  const { user, fingerprint, refreshUser } = useAuth();
  const [enrolledFingerprint, setEnrolledFingerprint] = useState<FingerprintType | null>(fingerprint);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEnrolledFingerprint(fingerprint);
  }, [fingerprint]);

  const handleEnrollment = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<{ fingerprint: FingerprintType }>("/api/auth/enroll-fingerprint");
      setEnrolledFingerprint(response.fingerprint);
      await refreshUser();
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : "Enrollment failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const continuePath = user?.role === "ADMIN" ? "/overview" : "/portal";

  return (
    <div className="min-h-screen bg-surface p-8 lg:p-16 flex items-center justify-center">
      <div className="w-full max-w-4xl grid lg:grid-cols-[0.9fr_1.1fr] bg-surface-container-low overflow-hidden">
        <aside className="bg-primary-container text-white p-10 flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Fingerprint className="w-10 h-10" />
            <h1 className="text-3xl font-black uppercase tracking-tight">Biometric Capture</h1>
          </div>
          <div className="flex justify-between items-center bg-white/10 p-4">
            <span className="text-xs font-bold uppercase tracking-widest">Scanner Status</span>
            <span className="text-xs font-black bg-green-500 text-white px-2 py-1">READY</span>
          </div>
          <div className="h-2 bg-white/20 w-full">
            <div className="h-full bg-white w-3/5" />
          </div>
          <p className="text-[10px] font-bold opacity-70 leading-relaxed">
            PLACE SUBJECT&apos;S RIGHT INDEX FINGER ON THE SCANNER TO BEGIN ENROLLMENT SEQUENCE.
          </p>
        </aside>

        <section className="p-10 flex flex-col justify-between gap-8">
          <div className="space-y-5">
            <div>
              <p className="text-primary font-black uppercase tracking-[0.3em] text-xs mb-3">Final Activation</p>
              <h2 className="text-4xl font-black text-primary uppercase tracking-tighter">
                {user?.fullName || "Transit User"}
              </h2>
            </div>

            {error ? (
              <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
            ) : null}

            <div className="bg-surface-container-highest p-6 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Enrollment Output
              </p>
              <p className="text-xs font-bold text-on-surface-variant">
                {enrolledFingerprint
                  ? "Biometric hash has been generated and linked to this wallet."
                  : "No fingerprint is linked yet. Generate one simulated hash to finish activation."}
              </p>
              <div className="bg-white p-4 border border-outline-variant/20 min-h-16 flex items-center">
                <code className="text-xs font-mono break-all text-primary">
                  {enrolledFingerprint?.fingerprintHash || "Awaiting enrollment output..."}
                </code>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <button
              disabled={isSubmitting}
              onClick={handleEnrollment}
              className="bg-primary text-white px-8 py-4 font-black uppercase tracking-[0.2em] disabled:opacity-60"
              type="button"
            >
              {enrolledFingerprint ? "Regenerate Fingerprint" : "Generate Fingerprint"}
            </button>
            <button
              disabled={!enrolledFingerprint}
              onClick={() => navigate(continuePath, { replace: true })}
              className="border-2 border-primary text-primary px-8 py-4 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-40"
              type="button"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

