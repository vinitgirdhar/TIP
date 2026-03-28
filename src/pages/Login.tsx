import React, { useState } from "react";
import { Fingerprint, LockKeyhole, Mail, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function resolveDestination(role: "ADMIN" | "USER", requiresEnrollment: boolean): string {
  if (role === "ADMIN") {
    return "/overview";
  }

  return requiresEnrollment ? "/enroll" : "/portal";
}

export function Login() {
  const navigate = useNavigate();
  const { login, loginWithFingerprint } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fingerprintHash, setFingerprintHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      navigate(resolveDestination(session.user.role, session.requiresEnrollment), { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFingerprintLogin = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await loginWithFingerprint({ fingerprintHash });
      navigate(resolveDestination(session.user.role, session.requiresEnrollment), { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Biometric login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface grid lg:grid-cols-2">
      <section className="bg-primary text-white p-12 lg:p-16 flex flex-col justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/60 mb-4">
            Monolith Access Grid
          </p>
          <h1 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter leading-none">
            Re-enter
            <br />
            the network.
          </h1>
        </div>
        <div className="space-y-5 max-w-md">
          <div className="border-l-4 border-white/40 pl-5">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50 mb-2">Admin Seed</p>
            <p className="text-sm font-bold">admin@monolith.transit / admin123</p>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            Authenticate with your wallet credentials or a simulated fingerprint hash. Role routing and session
            persistence are now enforced from the server.
          </p>
        </div>
      </section>

      <section className="p-8 lg:p-16 flex items-center">
        <div className="w-full max-w-2xl space-y-8">
          <div>
            <p className="text-primary font-black uppercase tracking-[0.3em] text-xs mb-3">Security Handshake</p>
            <h2 className="text-4xl font-black text-primary uppercase tracking-tighter">Operator Login</h2>
          </div>

          {error ? (
            <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
          ) : null}

          <form onSubmit={handlePasswordLogin} className="bg-surface-container-low p-8 grid gap-6">
            <div className="grid gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Contact Email
              </label>
              <div className="bg-surface-container-high px-4 py-4 flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="bg-transparent w-full outline-none text-sm font-bold"
                  placeholder="admin@monolith.transit"
                  type="email"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Password
              </label>
              <div className="bg-surface-container-high px-4 py-4 flex items-center gap-3">
                <LockKeyhole className="w-5 h-5 text-primary" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-transparent w-full outline-none text-sm font-bold"
                  placeholder="••••••••"
                  type="password"
                />
              </div>
            </div>

            <button
              disabled={isSubmitting}
              className="bg-primary text-white px-8 py-4 font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-60"
              type="submit"
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="bg-primary-container text-white p-8 space-y-5">
            <div className="flex items-center gap-4">
              <Fingerprint className="w-8 h-8" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Biometric Path</p>
                <h3 className="text-2xl font-black uppercase tracking-tight">Fingerprint Verify</h3>
              </div>
            </div>
            <input
              value={fingerprintHash}
              onChange={(event) => setFingerprintHash(event.target.value)}
              className="w-full bg-white/10 px-4 py-4 outline-none text-sm font-mono"
              placeholder="Paste enrolled fingerprint hash"
              type="text"
            />
            <button
              disabled={isSubmitting || !fingerprintHash.trim()}
              onClick={handleFingerprintLogin}
              className="w-full border-2 border-white px-6 py-4 font-black uppercase tracking-[0.2em] disabled:opacity-60"
              type="button"
            >
              Biometric Login
            </button>
          </div>

          <p className="text-sm font-bold text-on-surface-variant">
            Need a wallet profile?{" "}
            <Link to="/register" className="text-primary underline">
              Register here
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

