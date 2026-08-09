"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Mail, Plus } from "lucide-react";

// ASC-142 -- two independent actions in one view, per the decoupled model:
// a firm must exist before an admin can be invited into it, and a firm can
// have multiple admins invited into it over time (not just one at creation
// time, unlike the earlier one-shot /firms/invite-admin page this replaces).
// Styling mirrors app/(dashboard)/{users,admins}/page.tsx, not the AuthCard
// flows (login/register) -- this lives inside the dashboard chrome now.

interface Firm {
  id: string;
  name: string;
  createdAt: string;
}

const inputClass = "w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none";
const labelClass = "block text-sm font-medium text-slate-700 mb-1";
const errorClass = "text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200";
const successClass = "text-sm text-teal-800 bg-teal-50 p-3 rounded-md border border-teal-200";

export default function FirmsPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loadingFirms, setLoadingFirms] = useState(true);

  async function fetchFirms() {
    try {
      setLoadingFirms(true);
      const res = await fetch("/api/v1/org/firms");
      if (res.ok) {
        const data = await res.json();
        setFirms(data.firms || []);
      }
    } catch (err) {
      console.error("Failed to fetch firms:", err);
    } finally {
      setLoadingFirms(false);
    }
  }

  useEffect(() => {
    fetchFirms();
  }, []);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Firms</h1>
        <p className="text-sm text-slate-500">Create firms and invite their admins (apps/backend database).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <CreateFirmSection firms={firms} loadingFirms={loadingFirms} onCreated={(firm) => setFirms((prev) => [firm, ...prev])} />
        <InviteFirmAdminSection firms={firms} />
      </div>
    </div>
  );
}

function CreateFirmSection({
  firms,
  loadingFirms,
  onCreated,
}: {
  firms: Firm[];
  loadingFirms: boolean;
  onCreated: (firm: Firm) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/org/firms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create firm");
      }
      onCreated(data.firm);
      setName("");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Building2 className="size-5 text-teal-600" />
        Create a firm
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}
        <div>
          <label className={labelClass}>Firm name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Cohen & Partners, LLP"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white transition-colors"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {loading ? "Creating…" : "Create firm"}
        </button>
      </form>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-500 mb-2">Existing firms ({firms.length})</p>
        {loadingFirms ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 className="size-4 animate-spin" />
            Loading firms...
          </div>
        ) : firms.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No firms yet -- create one above.</p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {firms.map((firm) => (
              <li key={firm.id} className="text-sm text-slate-700 py-1.5 px-2 rounded hover:bg-slate-50">
                {firm.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InviteFirmAdminSection({ firms }: { firms: Firm[] }) {
  const [firmId, setFirmId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firmId) {
      setError("Choose a firm first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/org/invite-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, firmId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }
      setSentTo(email);
      setFullName("");
      setEmail("");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <Mail className="size-5 text-teal-600" />
        Invite a firm admin
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}
        {sentTo && <div className={successClass}>Invitation sent to {sentTo}.</div>}

        <div>
          <label className={labelClass}>Firm</label>
          <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className={inputClass} required disabled={firms.length === 0}>
            <option value="" disabled>
              {firms.length === 0 ? "Create a firm first" : "Select a firm…"}
            </option>
            {firms.map((firm) => (
              <option key={firm.id} value={firm.id}>
                {firm.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Admin's full name</label>
          <input
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder="Jane Cohen"
          />
        </div>

        <div>
          <label className={labelClass}>Admin's email address</label>
          <input
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="jane@example.com"
          />
        </div>

        <button
          type="submit"
          disabled={loading || firms.length === 0}
          className="flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white transition-colors"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? "Sending…" : "Send invitation"}
        </button>
      </form>
    </section>
  );
}
