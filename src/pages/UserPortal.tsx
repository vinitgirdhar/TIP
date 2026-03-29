import React, { useEffect, useState } from "react";
import { Fingerprint, Download, Bolt, TrainFront } from "lucide-react";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import type { Transaction, Trip, Wallet } from "../shared/types";

interface WalletResponse {
  wallet: Wallet;
  activeTrip: Trip | null;
}

export function UserPortal() {
  const { user, fingerprint, refreshUser } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPortal = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [walletResponse, transactionsResponse] = await Promise.all([
        api.get<WalletResponse>("/api/wallet"),
        api.get<Transaction[]>("/api/wallet/transactions"),
      ]);

      setWallet(walletResponse.wallet);
      setActiveTrip(walletResponse.activeTrip);
      setTransactions(transactionsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load wallet.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPortal();
  }, []);

  const rechargeWallet = async (rawAmount: number) => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<{ wallet: Wallet; transaction: Transaction }>("/api/wallet/recharge", {
        amount: rawAmount,
      });
      setWallet(response.wallet);
      setTransactions((current) => [response.transaction, ...current]);
      setMessage(`${formatCurrency(rawAmount)} added to wallet.`);
      setAmount("");
      await refreshUser();
    } catch (rechargeError) {
      setError(rechargeError instanceof Error ? rechargeError.message : "Recharge failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRechargeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await rechargeWallet(Number(amount));
  };

  const biometricLink = fingerprint ? "Active Biometric Link" : "Enrollment Pending";

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-16">
      {error ? (
        <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold mb-6">{error}</div>
      ) : null}
      {message ? <div className="bg-primary text-white px-5 py-4 text-sm font-bold mb-6">{message}</div> : null}

      {activeTrip ? (
        <div className="mb-6 flex bg-primary px-4 py-4 text-white sm:mb-8 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
            <TrainFront className="w-6 h-6" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">Currently In Transit</p>
              <p className="text-sm font-bold leading-relaxed">
                Entered at {activeTrip.entryStation.name}. Complete your exit tap to settle the fare.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-6 lg:gap-12">
        <section className="col-span-12 min-w-0 space-y-6 lg:col-span-8">
          <header>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant block mb-2">
              Account Overview
            </span>
            <h3 className="text-3xl font-black text-primary uppercase tracking-tighter leading-none sm:text-4xl lg:text-5xl">
              Biometric Wallet
            </h3>
          </header>

          <div className="relative flex min-h-[280px] flex-col justify-between overflow-hidden bg-primary-container p-6 text-white sm:min-h-[320px] sm:p-8 lg:p-12">
            <div className="absolute -right-8 -top-8 opacity-10 sm:-right-12 sm:-top-12">
              <Fingerprint className="h-[180px] w-[180px] sm:h-[240px] sm:w-[240px] lg:h-[300px] lg:w-[300px]" />
            </div>

            <div className="relative z-10 min-w-0">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-70">
                Current Available Balance
              </span>
              <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="break-words text-4xl font-black leading-none tracking-tighter sm:text-6xl lg:text-7xl">
                  {isLoading ? "..." : formatCurrency(wallet?.balance ?? 0)}
                </span>
                <span className="text-base font-bold opacity-60 sm:text-xl">INR</span>
              </div>
            </div>

            <div className="relative z-10 mt-8 flex flex-col gap-6 border-t border-white/20 pt-6 sm:mt-auto sm:flex-row sm:items-end sm:justify-between sm:pt-8">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Identity Lock</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 ${fingerprint ? "bg-green-400" : "bg-yellow-400"} rounded-full`} />
                  <span className="text-sm font-black uppercase tracking-widest break-words">{biometricLink}</span>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Account Holder</span>
                <p className="break-all text-sm font-black tracking-widest">{user?.govId}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="col-span-12 min-w-0 border-l-4 border-primary bg-surface-container-highest p-6 sm:p-8 lg:col-span-4 lg:p-12">
          <form onSubmit={handleRechargeSubmit}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant block mb-2">
              Security Protocol
            </span>
            <h3 className="mb-8 text-2xl font-black text-primary uppercase tracking-tighter leading-tight sm:text-3xl">
              Instant
              <br />
              Recharge
            </h3>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant block mb-2">
                  Amount (INR)
                </label>
                <div className="relative">
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full bg-surface-container-high border-none focus:ring-0 p-4 font-black text-2xl text-primary border-b-2 border-transparent focus:border-primary transition-all outline-none"
                    placeholder="0.00"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-primary/40">
                    {"\u20B9"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[25, 50, 100].map((quickAmount) => (
                  <button
                    key={quickAmount}
                    onClick={() => void rechargeWallet(quickAmount)}
                    className="bg-surface-container-high py-3 font-black hover:bg-primary hover:text-white transition-colors"
                    type="button"
                  >
                    {"\u20B9"}
                    {quickAmount}
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={isSubmitting}
              className="w-full bg-primary text-white py-5 font-black uppercase tracking-widest mt-8 flex items-center justify-center gap-3 disabled:opacity-60"
              type="submit"
            >
              <Bolt className="w-5 h-5" />
              Authorize Transfer
            </button>
          </form>
        </section>

        <section className="col-span-12 mt-6 min-w-0 lg:mt-12">
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant block mb-2">
                Infrastructure Usage
              </span>
              <h3 className="text-3xl font-black text-primary uppercase tracking-tighter sm:text-4xl">Transit Ledger</h3>
            </div>
            <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary border-b-2 border-primary pb-1">
              Export Statements <Download className="w-3 h-3" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full border-collapse text-left">
              <thead className="bg-surface-container-high border-b-2 border-primary">
                <tr>
                  {["Timestamp", "Description", "Protocol", "Amount"].map((heading) => (
                    <th
                      key={heading}
                      className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y-8 divide-surface">
                {isLoading ? (
                  <tr className="bg-surface-container-low">
                    <td className="p-6 text-on-surface-variant" colSpan={4}>
                      Loading wallet ledger...
                    </td>
                  </tr>
                ) : transactions.length ? (
                  transactions.map((item) => (
                    <tr key={item.id} className="bg-surface-container-low hover:bg-white transition-colors">
                      <td className="p-6">
                        <div className="font-black text-primary">{formatDateTime(item.createdAt)}</div>
                        <div className="text-[10px] text-on-surface-variant font-bold tracking-widest uppercase">
                          Balance after: {formatCurrency(item.balanceAfter)}
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="font-black text-primary uppercase tracking-tight">{item.description}</div>
                        <div className="text-[10px] text-on-surface-variant font-bold tracking-widest uppercase">
                          Reference: {item.referenceId || "SYSTEM"}
                        </div>
                      </td>
                      <td className="p-6 text-center">
                        <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-[10px] font-black tracking-widest uppercase">
                          {item.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-6 text-right">
                        <div className={`font-black ${item.amount >= 0 ? "text-primary" : "text-error"}`}>
                          {formatCurrency(item.amount)}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-surface-container-low">
                    <td className="p-6 text-on-surface-variant" colSpan={4}>
                      No wallet activity has been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
