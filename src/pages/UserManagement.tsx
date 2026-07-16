import React, { useEffect, useMemo, useState } from "react";
import { CreditCard, Fingerprint, Search } from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency, formatDateTime } from "../lib/utils";
import type {
  FingerprintEnrollmentSession,
  HardwareDevice,
  HardwareFingerprintVerificationResponse,
  User,
  UserSummary,
  Wallet,
} from "../shared/types";

interface AdminRegisterResponse {
  user: User;
  wallet: Wallet;
  temporaryPassword: string | null;
  createdByAdmin: boolean;
}

interface FingerprintLinkResponse {
  message: string;
  user_id: number;
  fingerprint_id: number;
  user: User;
  wallet: Wallet;
  device_id: string | null;
}

interface UserUpdateResponse {
  user: User;
}

const EMPTY_USER_FORM = {
  fullName: "",
  govId: "",
  email: "",
  mobile: "",
};

export function UserManagement() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    govId: "",
    email: "",
    mobile: "",
  });
  const [editForm, setEditForm] = useState(EMPTY_USER_FORM);
  const [fingerprintLinkForm, setFingerprintLinkForm] = useState({
    fingerprintId: "",
    deviceId: "",
  });
  const [hardwareEnrollmentForm, setHardwareEnrollmentForm] = useState({
    deviceId: "",
  });
  const [verifyForm, setVerifyForm] = useState({
    fingerprintId: "",
    deviceId: "",
  });
  const [enrollmentSession, setEnrollmentSession] = useState<FingerprintEnrollmentSession | null>(null);
  const [verificationReceipt, setVerificationReceipt] = useState<HardwareFingerprintVerificationResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPageData = async () => {
    setIsLoading(true);

    try {
      const [usersResponse, devicesResponse] = await Promise.all([
        api.get<UserSummary[]>("/api/users"),
        api.get<HardwareDevice[]>("/api/fingerprint/devices"),
      ]);

      setUsers(usersResponse);
      setDevices(devicesResponse);
      setSelectedUserId((current) => current || String(usersResponse[0]?.id || ""));
      const defaultEntryDevice =
        devicesResponse.find((device) => device.gateMode === "ENTRY")?.deviceId || devicesResponse[0]?.deviceId || "";
      setFingerprintLinkForm((current) => ({
        ...current,
        deviceId: current.deviceId || defaultEntryDevice,
      }));
      setHardwareEnrollmentForm((current) => ({
        ...current,
        deviceId: current.deviceId || defaultEntryDevice,
      }));
      setVerifyForm((current) => ({
        ...current,
        deviceId: current.deviceId || defaultEntryDevice,
      }));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, []);

  const selectedUser = useMemo(
    () => users.find((user) => String(user.id) === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const term = search.trim().toLowerCase();
        if (!term) {
          return true;
        }

        return [user.fullName, user.govId, user.email, String(user.fingerprintId ?? "")]
          .some((value) => value.toLowerCase().includes(term));
      }),
    [users, search],
  );

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(EMPTY_USER_FORM);
      setFingerprintLinkForm((current) => ({
        ...current,
        fingerprintId: "",
      }));
      setVerifyForm((current) => ({
        ...current,
        fingerprintId: "",
      }));
      return;
    }

    setEditForm({
      fullName: selectedUser.fullName,
      govId: selectedUser.govId,
      email: selectedUser.email,
      mobile: selectedUser.mobile,
    });
    setFingerprintLinkForm((current) => ({
      ...current,
      fingerprintId: selectedUser.fingerprintId != null ? String(selectedUser.fingerprintId) : "",
    }));
    setVerifyForm((current) => ({
      ...current,
      fingerprintId: selectedUser.fingerprintId != null ? String(selectedUser.fingerprintId) : "",
    }));
  }, [selectedUser]);

  useEffect(() => {
    if (!enrollmentSession || (enrollmentSession.status !== "pending" && enrollmentSession.status !== "claimed")) {
      return;
    }

    let cancelled = false;

    const pollSession = async () => {
      try {
        const response = await api.get<FingerprintEnrollmentSession>(
          `/api/fingerprint/enrollment/${enrollmentSession.id}`,
        );

        if (cancelled) {
          return;
        }

        setEnrollmentSession(response);

        if (response.status === "completed") {
          setFingerprintLinkForm((current) => ({
            ...current,
            fingerprintId: String(response.fingerprintId),
            deviceId: response.deviceId,
          }));
          setVerifyForm((current) => ({
            ...current,
            fingerprintId: String(response.fingerprintId),
            deviceId: response.deviceId,
          }));
          setMessage(`Fingerprint ${response.fingerprintId} enrolled and linked to ${response.user?.fullName || "the user"}.`);
          setError(null);
          await loadPageData();
        }

        if (response.status === "failed" || response.status === "expired") {
          setError(response.error || response.message);
          await loadPageData();
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Failed to refresh enrollment status.");
        }
      }
    };

    void pollSession();
    const intervalId = window.setInterval(() => {
      void pollSession();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enrollmentSession?.id, enrollmentSession?.status]);

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
      setSelectedUserId(String(response.user.id));
      setVerificationReceipt(null);
      setMessage(
        response.temporaryPassword
          ? `User created. Temporary password: ${response.temporaryPassword}`
          : "User created successfully.",
      );
      await loadPageData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "User registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectedUserChange = (nextUserId: string) => {
    setSelectedUserId(nextUserId);
    setVerificationReceipt(null);
    setEnrollmentSession((current) => (current && String(current.userId) !== nextUserId ? null : current));
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedUserId) {
      setError("Select a user to edit.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.put<UserUpdateResponse>(`/api/users/${selectedUserId}`, editForm);
      setMessage(`${response.user.fullName} updated successfully.`);
      await loadPageData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "User update failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFingerprintLinkSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<FingerprintLinkResponse>("/api/register-fingerprint", {
        user_id: Number(selectedUserId),
        fingerprint_id: Number(fingerprintLinkForm.fingerprintId),
        device_id: fingerprintLinkForm.deviceId || undefined,
      });
      setFingerprintLinkForm((current) => ({
        ...current,
        fingerprintId: "",
      }));
      setVerifyForm((current) => ({
        ...current,
        fingerprintId: String(response.fingerprint_id),
      }));
      setVerificationReceipt(null);
      setMessage(`Fingerprint ${response.fingerprint_id} linked to ${response.user.fullName}.`);
      await loadPageData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Fingerprint linking failed.");
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
      setAllocationAmount("");
      setVerificationReceipt(null);
      setMessage(`Allocated ${formatCurrency(Number(allocationAmount))} to the selected wallet.`);
      await loadPageData();
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : "Allocation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartHardwareEnrollment = async () => {
    if (!selectedUserId) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<FingerprintEnrollmentSession>("/api/fingerprint/enrollment/start", {
        user_id: Number(selectedUserId),
        device_id: hardwareEnrollmentForm.deviceId,
      });
      setEnrollmentSession(response);
      setVerificationReceipt(null);
      setMessage(
        `${
          selectedUser?.fingerprintId != null ? "Fingerprint re-registration" : "Enrollment"
        } started for fingerprint ID ${response.fingerprintId}. Keep ${
          response.device?.label || response.deviceId
        } connected and place the passenger's finger on the sensor.`,
      );
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : "Hardware fingerprint enrollment failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardwareVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.post<HardwareFingerprintVerificationResponse>("/api/fingerprint/verify", {
        fingerprint_id: Number(verifyForm.fingerprintId),
        device_id: verifyForm.deviceId,
      });
      setVerificationReceipt(response);
      setMessage(
        response.action === "TAP_OUT"
          ? `Exit allowed. Fare deducted: ${formatCurrency(response.fare ?? 0)}.`
          : "Entry allowed. Trip marked in transit.",
      );
      await loadPageData();
    } catch (verificationError) {
      setVerificationReceipt(null);
      setError(verificationError instanceof Error ? verificationError.message : "Hardware verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserSummary) => {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setError(null);
    setMessage(null);

    try {
      await api.put(`/api/users/${user.id}/status`, { status: nextStatus });
      setVerificationReceipt(null);
      setMessage(`${user.fullName} is now ${nextStatus}.`);
      await loadPageData();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Status update failed.");
    }
  };

  return (
    <div className="p-6 lg:p-12 space-y-12">
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
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-8">
          <div className="bg-surface-container-low p-10 flex flex-col gap-8">
            <div className="flex justify-between items-end border-b-2 border-primary pb-4">
              <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Identity Enrollment</h3>
              <span className="text-[10px] font-bold text-primary-container bg-primary-fixed px-3 py-1">
                FORM NO. 882-B
              </span>
            </div>
            <form onSubmit={handleRegisterSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
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
              <div className="md:col-span-2 flex justify-end mt-4">
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

          <div className="bg-surface-container-highest p-10 flex flex-col gap-8">
            <div className="flex justify-between items-end border-b-2 border-primary pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Existing Passenger Record
                </p>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Edit User Details</h3>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">`/api/users/:id`</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Selected User
                </label>
                <select
                  value={selectedUserId}
                  onChange={(event) => handleSelectedUserChange(event.target.value)}
                  className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white p-4 flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Current Fingerprint
                </span>
                <span className="text-lg font-black text-primary">{selectedUser?.fingerprintId ?? "Not Linked"}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {selectedUser?.status || "No User Selected"}
                </span>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
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
                    value={editForm[field as keyof typeof editForm]}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                    placeholder={placeholder}
                    type="text"
                    disabled={!selectedUserId}
                  />
                </div>
              ))}

              <div className="md:col-span-2 flex items-center justify-between gap-4 mt-2">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed">
                  Update the selected passenger record here. Use the fingerprint enrollment panel to re-register the
                  passenger&apos;s biometrics after profile changes.
                </p>
                <button
                  disabled={!selectedUserId || isSubmitting}
                  type="submit"
                  className="bg-primary text-white px-10 py-4 font-black text-sm uppercase tracking-widest disabled:opacity-60"
                >
                  Save User Changes
                </button>
              </div>
            </form>
          </div>

          <div className="bg-surface-container-highest p-10 flex flex-col gap-8">
            <div className="flex justify-between items-end border-b-2 border-primary pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Hardware Mapping
                </p>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tight">Link Fingerprint To User</h3>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                `/api/register-fingerprint`
              </span>
            </div>

            <form onSubmit={handleFingerprintLinkSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  User
                </label>
                <select
                  value={selectedUserId}
                  onChange={(event) => handleSelectedUserChange(event.target.value)}
                  className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Fingerprint ID
                </label>
                <input
                  value={fingerprintLinkForm.fingerprintId}
                  onChange={(event) =>
                    setFingerprintLinkForm((current) => ({
                      ...current,
                      fingerprintId: event.target.value,
                    }))
                  }
                  className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                  placeholder="7"
                  type="number"
                  min="1"
                />
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Enrollment Device
                </label>
                <select
                  value={fingerprintLinkForm.deviceId}
                  onChange={(event) =>
                    setFingerprintLinkForm((current) => ({
                      ...current,
                      deviceId: event.target.value,
                    }))
                  }
                  className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                >
                  <option value="">No device metadata</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.deviceId}>
                      {device.deviceId} - {device.gateMode} - {device.station.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed md:col-span-2">
                User registers through the app first. This step stores the sensor&apos;s numeric fingerprint ID on that
                user.
              </div>

              <div className="flex items-end justify-end">
                <button
                  disabled={!selectedUserId || !fingerprintLinkForm.fingerprintId || isSubmitting}
                  type="submit"
                  className="w-full bg-primary text-white px-6 py-4 font-black uppercase tracking-widest disabled:opacity-60"
                >
                  Link Fingerprint
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 flex flex-col gap-8">
          <div className="bg-primary-container text-white p-8 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Fingerprint className="w-10 h-10" />
              <h3 className="text-xl font-black uppercase tracking-tight">Website Fingerprint Enrollment</h3>
            </div>
            <select
              value={selectedUserId}
              onChange={(event) => handleSelectedUserChange(event.target.value)}
              className="bg-white/10 p-4 font-bold outline-none"
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
            <select
              value={hardwareEnrollmentForm.deviceId}
              onChange={(event) =>
                setHardwareEnrollmentForm((current) => ({
                  ...current,
                  deviceId: event.target.value,
                }))
              }
              className="bg-white/10 p-4 font-bold outline-none"
            >
              <option value="">Select enrollment device</option>
              {devices.map((device) => (
                <option key={device.id} value={device.deviceId}>
                  {device.deviceId} - {device.gateMode} - {device.station.name}
                </option>
              ))}
            </select>
            <div className="flex justify-between items-center bg-white/10 p-4">
              <span className="text-xs font-bold uppercase tracking-widest">Enrollment Status</span>
              <span className="text-xs font-black bg-white text-primary px-2 py-1 uppercase">
                {enrollmentSession?.status || "idle"}
              </span>
            </div>
            {selectedUser ? (
              <div className="bg-white/10 p-4 flex flex-col gap-2 text-[10px] font-bold uppercase tracking-widest">
                <span>Selected User: {selectedUser.fullName}</span>
                <span>Current Fingerprint ID: {selectedUser.fingerprintId ?? "Not Linked"}</span>
                <span>
                  {selectedUser.fingerprintId != null
                    ? "Starting enrollment will re-register this same fingerprint ID on the hardware."
                    : "Starting enrollment will assign the next available fingerprint ID."}
                </span>
              </div>
            ) : null}
            <div className="h-2 bg-white/20 w-full">
              <div
                className={cn(
                  "h-full bg-white transition-all",
                  enrollmentSession?.status === "completed"
                    ? "w-full"
                    : enrollmentSession?.status === "claimed"
                      ? "w-2/3"
                      : enrollmentSession?.status === "pending"
                        ? "w-1/3"
                        : "w-0",
                )}
              />
            </div>
            <p className="text-[10px] font-bold opacity-70 leading-relaxed">
              Start the enrollment from the website, then keep the ESP32 enrollment sketch running on the selected
              device. The device will pick up the request, capture the fingerprint, and link it automatically.
            </p>
            {enrollmentSession ? (
              <div className="bg-white/10 p-4 flex flex-col gap-2 text-[10px] font-bold uppercase tracking-widest">
                <span>Assigned Fingerprint ID: {enrollmentSession.fingerprintId}</span>
                <span>Device: {enrollmentSession.device?.deviceId || enrollmentSession.deviceId}</span>
                <span>User: {enrollmentSession.user?.fullName || "Unknown"}</span>
                <span>Message: {enrollmentSession.message}</span>
                {enrollmentSession.error ? <span>Error: {enrollmentSession.error}</span> : null}
              </div>
            ) : null}
            <button
              disabled={!selectedUserId || !hardwareEnrollmentForm.deviceId || isSubmitting}
              onClick={handleStartHardwareEnrollment}
              className="bg-white text-primary py-4 font-black uppercase tracking-widest disabled:opacity-60"
              type="button"
            >
              {selectedUser?.fingerprintId != null ? "Re-register Fingerprint" : "Start Website Enrollment"}
            </button>
          </div>

          <div className="bg-surface-container-highest p-8 flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-black text-primary uppercase tracking-tight">Balance Allocation</h3>
            </div>
            <select
              value={selectedUserId}
              onChange={(event) => handleSelectedUserChange(event.target.value)}
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
              <span className="bg-surface-container-high flex items-center px-4 font-black text-primary">INR</span>
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

          <div className="bg-surface-container-low p-8 flex flex-col gap-6">
            <div className="flex justify-between items-end border-b-2 border-primary pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Gate Console
                </p>
                <h3 className="text-xl font-black text-primary uppercase tracking-tight">Verify Fingerprint Tap</h3>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                `/api/fingerprint/verify`
              </span>
            </div>

            <form onSubmit={handleHardwareVerify} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Fingerprint ID
                </label>
                <input
                  value={verifyForm.fingerprintId}
                  onChange={(event) =>
                    setVerifyForm((current) => ({
                      ...current,
                      fingerprintId: event.target.value,
                    }))
                  }
                  className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                  placeholder="1"
                  type="number"
                  min="1"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Device ID
                </label>
                <select
                  value={verifyForm.deviceId}
                  onChange={(event) =>
                    setVerifyForm((current) => ({
                      ...current,
                      deviceId: event.target.value,
                    }))
                  }
                  className="bg-white border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                >
                  <option value="">Select gate</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.deviceId}>
                      {device.deviceId} - {device.gateMode} - {device.station.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                disabled={!verifyForm.fingerprintId || !verifyForm.deviceId || isSubmitting}
                type="submit"
                className="bg-primary text-white py-4 font-black uppercase tracking-widest disabled:opacity-60"
              >
                Authorize Gate Tap
              </button>
            </form>

            {verificationReceipt ? (
              <div className="bg-surface-container-high p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    Result
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                    {verificationReceipt.access} / {verificationReceipt.action?.replace("_", " ") || verificationReceipt.status}
                  </span>
                </div>
                <p className="text-sm font-black text-primary">{verificationReceipt.message}</p>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  User: {verificationReceipt.user?.fullName || "Unknown"}
                </p>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Device: {verificationReceipt.device?.deviceId || "N/A"} /{" "}
                  {verificationReceipt.device?.gateMode || "N/A"} / {verificationReceipt.device?.station.name || "N/A"}
                </p>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Wallet Balance: {formatCurrency(verificationReceipt.wallet?.balance ?? 0)}
                </p>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  Entry: {verificationReceipt.trip ? formatDateTime(verificationReceipt.trip.entryTime) : "N/A"}
                </p>
                {verificationReceipt.fare != null ? (
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Fare: {formatCurrency(verificationReceipt.fare)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
              className="w-full lg:w-80 bg-surface-container-low border-none focus:ring-2 focus:ring-primary text-xs font-bold uppercase p-4 pr-12 outline-none"
              placeholder="SEARCH BY NAME, ID, OR FINGERPRINT..."
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
                      {person.fingerprintId ?? "NOT LINKED"}
                      <div className="mt-2 text-[10px] font-black text-on-surface-variant">
                        {person.fingerprintEnrolled ? "ENROLLED" : "NOT DETECTED"}
                      </div>
                    </td>
                    <td className="p-6 font-black">{formatCurrency(person.walletBalance)}</td>
                    <td className="p-6 text-xs uppercase">
                      {person.lastActivityAt ? formatDateTime(person.lastActivityAt) : "No activity"}
                    </td>
                    <td className="p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleSelectedUserChange(String(person.id))}
                          className="text-primary hover:underline font-black text-[10px] uppercase tracking-widest"
                          type="button"
                        >
                          {selectedUserId === String(person.id) ? "Selected" : "Manage"}
                        </button>
                        <button
                          onClick={() => void handleToggleStatus(person)}
                          className="text-primary hover:underline font-black text-[10px] uppercase tracking-widest"
                          type="button"
                        >
                          {person.status === "ACTIVE" ? "Suspend" : "Activate"}
                        </button>
                      </div>
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
