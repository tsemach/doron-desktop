"use client";

import { useState } from "react";
import { AuthCard, Button, errorClass, inputClass, labelClass } from "@workspace/ui";
import { isValidEmail, isValidFirmName, isValidFullName } from "../../../lib/validation";

// Reachable only while signed in (middleware.ts protects everything except
// /login), same as /register -- lives outside the (dashboard) route group
// so it gets the full AuthCard treatment instead of the sidebar/top-bar
// chrome, matching /register's precedent for "an admin creates/invites
// another account" flows.
//
// Unlike /register (which creates an office admin_users row directly),
// this sends an email invitation that the recipient accepts themself --
// see app/api/v1/org/invite-admin/route.ts, the only code path allowed to
// create a role="admin" invitation (ASC-142 rule 2).
export default function InviteFirmAdminPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [firmName, setFirmName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isValidFullName(fullName)) {
      setError("Full name contains invalid characters.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!isValidFirmName(firmName)) {
      setError("Firm name contains invalid characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/org/invite-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, firmName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }
      setSentTo(email);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Invitation sent" subtitle={`${sentTo} can accept it from their email to finish setting up ${firmName}.`}>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <a href="/" className="font-medium text-foreground underline">
            Back to home
          </a>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Invite a firm admin" subtitle="Creates a new firm and invites its first admin by email.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}

        <div>
          <label className={labelClass}>Firm name</label>
          <input
            type="text"
            name="firmName"
            autoComplete="off"
            required
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            className={inputClass}
            placeholder="Cohen & Partners, LLP"
          />
        </div>

        <div>
          <label className={labelClass}>Admin's full name</label>
          <input
            type="text"
            name="name"
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
            name="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="jane@example.com"
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Sending…" : "Send invitation"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <a href="/" className="font-medium text-foreground underline">
          Back to home
        </a>
      </p>
    </AuthCard>
  );
}
