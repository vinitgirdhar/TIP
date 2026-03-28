import React, { useEffect, useMemo, useState } from "react";
import { Fingerprint, Search, CreditCard } from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency, formatDateTime } from "../lib/utils";
import type { User, UserSummary, Wallet } from "../shared/types";

interface AdminRegisterResponse {
  user: User;
  wallet: Wallet;
  temporaryPassword: string | null;
  createdByAdmin: boolean;
}

export function UserManagement() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    govId: "",
    email: "",
    mobile: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);

    try {
      const response = await api.get<UserSummary[]>("/api/users");
      setUsers(response);
      setSelectedUserId((current) => current || String(response[0]?.id || ""));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const term = search.trim().toLowerCase();
        if (!term) {
          return true;
        }

        return [user.fullName, user.govId, user.email].some((value) => value.toLowerCase().includes(term));
      }),
    [users, search],
  );

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<AdminRegisterResponse>("/api/auth/register", registerForm);
      setRegisterForm({
        fullName: "",
        govId: "",
        email: "",
        mobile: "",
      });
      setMessage(
        response.temporaryPassword
          ? `User created. Temporary password: ${response.temporaryPassword}`
          : "User created successfully.",
      );
      await loadUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "User registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAllocateFunds = async () => {
    if (!selectedUserId) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      await api.post(`/api/users/${selectedUserId}/allocate`, { amount: Number(allocationAmount) });
      setMessage(`Allocated ${formatCurrency(Number(allocationAmount))} to the selected wallet.`);
      setAllocationAmount("");
      await loadUsers();
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : "Allocation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnrollFingerprint = async () => {
    if (!selectedUserId) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<{ fingerprint: { fingerprintHash: string } }>("/api/auth/enroll-fingerprint", {
        userId: Number(selectedUserId),
      });
      setMessage(`Fingerprint enrolled. Hash: ${response.fingerprint.fingerprintHash}`);
      await loadUsers();
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : "Fingerprint enrollment failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserSummary) => {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

    try {
      await api.put(`/api/users/${user.id}/status`, { status: nextStatus });
      setMessage(`${user.fullName} is now ${nextStatus}.`);
      await loadUsers();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Status update failed.");
    }
  };

  return (
    <div className="p-12 space-y-12">
      <header>
        <div className="flex flex-col gap-2">
          <span className="text-primary font-bold text-xs uppercase tracking-[0.3em]">Operational Portal</span>
          <h2 className="text-5xl font-black text-primary tracking-tighter uppercase">User Management</h2>
        </div>
      </header>

      {error ? (
        <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold">{error}</div>
      ) : null}
      {message ? <div className="bg-primary text-white px-5 py-4 text-sm font-bold">{message}</div> : null}

      <section className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-7 bg-surface-container-low p-10 flex flex-col gap-8">
          <div className="flex justify-between items-end border-b-2 border-primary pb-4">
            <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Identity Enrollment</h3>
            <span className="text-[10px] font-bold text-primary-container bg-primary-fixed px-3 py-1">
              FORM NO. 882-B
            </span>
          </div>
          <form onSubmit={handleRegisterSubmit} className="grid grid-cols-2 gap-x-8 gap-y-6">
            {[
              ["fullName", "Full Legal Name", "SURNAME, GIVEN NAME"],
              ["govId", "Government ID Number", "PX-000-000-000"],
              ["email", "Contact Email", "ADMIN@SECURE.TRANSIT"],
              ["mobile", "Mobile Linkage", "+1 (555) 000-0000"],
            ].map(([field, label, placeholder]) => (
              <div key={field} className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {label}
                </label>
                <input
                  value={registerForm[field as keyof typeof registerForm]}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  className="bg-surface-container-high border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                  placeholder={placeholder}
                  type="text"
                />
              </div>
            ))}
            <div className="col-span-2 flex justify-end mt-4">
              <button
                disabled={isSubmitting}
                type="submit"
                className="bg-primary text-white px-10 py-4 font-black text-sm uppercase tracking-widest disabled:opacity-60"
              >
                Initialize Registration
              </button>
            </div>
          </form>
        </div>

        <div className="col-span-12 lg:col-span-5 flex flex-col gap-8">
          <div className="bg-primary-container text-white p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Fingerprint className="w-10 h-10" />
              <h3 className="text-xl font-black uppercase tracking-tight">Biometric Capture</h3>
            </div>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="bg-white/10 p-4 font-bold outline-none"
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
            <div className="flex justify-between items-center bg-white/10 p-4">
              <span className="text-xs font-bold uppercase tracking-widest">Scanner Status</span>
              <span className="text-xs font-black bg-green-500 text-white px-2 py-1">READY</span>
            </div>
            <div className="h-2 bg-white/20 w-full">
              <div className="h-full bg-white w-1/3" />
            </div>
            <p className="text-[10px] font-bold opacity-70 leading-relaxed">
              Generate a simulated biometric hash for the selected wallet profile.
            </p>
            <button
              disabled={!selectedUserId || isSubmitting}
              onClick={handleEnrollFingerprint}
              className="bg-white text-primary py-4 font-black uppercase tracking-widest disabled:opacity-60"
              type="button"
            >
              Enroll Fingerprint
            </button>
          </div>

          <div className="bg-surface-container-highest p-8 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-black text-primary uppercase tracking-tight">Balance Allocation</h3>
            </div>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                value={allocationAmount}
                onChange={(event) => setAllocationAmount(event.target.value)}
                className="flex-grow bg-white border-none focus:ring-2 focus:ring-primary text-lg font-black p-4 outline-none"
                placeholder="0.00"
                type="number"
                step="0.01"
              />
              <span className="bg-surface-container-high flex items-center px-4 font-black text-primary">USD</span>
            </div>
            <button
              disabled={!selectedUserId || isSubmitting}
              onClick={handleAllocateFunds}
              className="w-full bg-white border-2 border-primary text-primary font-black py-4 uppercase tracking-widest disabled:opacity-60"
              type="button"
            >
              Assign Funds
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-2">
            <h3 className="text-3xl font-black text-primary uppercase tracking-tighter">
              Registered Personnel Ledger
            </h3>
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              SQLite-backed passenger directory
            </p>
          </div>
          <div className="relative">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-80 bg-surface-container-low border-none focus:ring-2 focus:ring-primary text-xs font-bold uppercase p-4 pr-12 outline-none"
              placeholder="SEARCH BY NAME OR ID..."
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-primary text-white text-left">
                {["Subject Identity", "Status", "Fingerprint ID", "Wallet Balance", "Last Activity", "Action"].map(
                  (heading) => (
                    <th key={heading} className="p-6 text-[10px] font-black uppercase tracking-widest">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="text-sm font-bold text-on-surface">
              {isLoading ? (
                <tr className="bg-surface-container-low">
                  <td className="p-6 text-on-surface-variant" colSpan={6}>
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length ? (
                filteredUsers.map((person, index) => (
                  <tr
                    key={person.id}
                    className={cn(
                      "border-b-4 border-surface",
                      index % 2 === 0 ? "bg-surface-container-low" : "bg-surface-container-high",
                    )}
                  >
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-surface-container-highest overflow-hidden">
                          <img
                            src={`https://picsum.photos/seed/passenger-${person.id}/100/100`}
                            alt={person.fullName}
                            className="w-full h-full object-cover grayscale"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black">{person.fullName}</span>
                          <span className="text-[10px] text-on-surface-variant">ID: {person.govId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <span
                        className={cn(
                          "text-[10px] px-2 py-1 font-black",
                          person.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : person.status === "SUSPENDED"
                              ? "bg-error/10 text-error"
                              : "bg-amber-100 text-amber-800",
                        )}
                      >
                        {person.status}
                      </span>
                    </td>
                    <td className="p-6 font-mono text-xs uppercase">
                      {person.fingerprintEnrolled ? "ENROLLED" : "NOT DETECTED"}
                    </td>
                    <td className="p-6 font-black">{formatCurrency(person.walletBalance)}</td>
                    <td className="p-6 text-xs uppercase">
                      {person.lastActivityAt ? formatDateTime(person.lastActivityAt) : "No activity"}
                    </td>
                    <td className="p-6">
                      <button
                        onClick={() => void handleToggleStatus(person)}
                        className="text-primary hover:underline font-black text-[10px] uppercase tracking-widest"
                        type="button"
                      >
                        {person.status === "ACTIVE" ? "Suspend" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="bg-surface-container-low">
                  <td className="p-6 text-on-surface-variant" colSpan={6}>
                    No users matched the current search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
