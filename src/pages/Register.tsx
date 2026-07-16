import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    govId: "",
    email: "",
    mobile: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await register(form);
      navigate(session.user.role === "ADMIN" ? "/overview" : "/portal", { replace: true });
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface p-8 lg:p-16 flex items-center justify-center">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.2fr_0.8fr] bg-surface-container-low overflow-hidden">
        <section className="p-10 lg:p-12">
          <div className="flex justify-between items-end border-b-2 border-primary pb-4 mb-8">
            <div>
              <span className="text-primary font-bold text-xs uppercase tracking-[0.3em] block mb-2">
                Identity Enrollment
              </span>
              <h1 className="text-5xl font-black text-primary tracking-tighter uppercase">Create Wallet Profile</h1>
            </div>
            <span className="text-[10px] font-bold text-primary-container bg-primary-fixed px-3 py-1">
              FORM NO. 882-B
            </span>
          </div>

          {error ? (
            <div className="bg-error-container text-on-error-container px-5 py-4 text-sm font-bold mb-6">{error}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {[
              ["fullName", "Full Legal Name", "SURNAME, GIVEN NAME", "text"],
              ["govId", "Government ID Number", "PX-000-000-000", "text"],
              ["email", "Contact Email", "operator@secure.transit", "email"],
              ["mobile", "Mobile Linkage", "+1 (555) 000-0000", "text"],
              ["password", "Access Password", "Create a password", "password"],
            ].map(([field, label, placeholder, type]) => (
              <div
                key={field}
                className={`flex flex-col gap-2 ${field === "password" ? "md:col-span-2" : ""}`}
              >
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {label}
                </label>
                <input
                  value={form[field as keyof typeof form]}
                  onChange={(event) => updateField(field as keyof typeof form, event.target.value)}
                  className="bg-surface-container-high border-none focus:ring-2 focus:ring-primary text-sm font-bold p-4 outline-none"
                  placeholder={placeholder}
                  type={type}
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
        </section>

        <aside className="bg-primary text-white p-10 lg:p-12 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-3">Zero Friction Flow</p>
            <h2 className="text-4xl font-black uppercase tracking-tight leading-none">
              Register.
              <br />
              Enroll.
              <br />
              Tap.
            </h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-white/70 leading-relaxed">
              New users receive an empty wallet immediately. Hardware fingerprint enrollment is now completed later from
              the admin device flow instead of a simulated hash step.
            </p>
            <p className="text-sm font-bold">
              Existing user?{" "}
              <Link to="/login" className="underline">
                Return to login
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
