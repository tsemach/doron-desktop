"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard, Button, PasswordInput, errorClass, inputClass, labelClass } from "@workspace/ui";
import { isValidFullName, isValidPasswordLength } from "../../lib/validation";

// ASC-142 -- lands here from the link in an invitation email (both the
// office's admin invites and a firm admin/manager/flat user's invites, all
// sent by lib/org/invitations.ts). The invitee has no account or session
// yet, so this is a public page/API pair (org/invitations/preview,
// org/invitations/accept), same "no session available" reasoning as
// register/page.tsx and verify-email/page.tsx.
interface InvitationPreview {
  email: string;
  role: string;
  firmName: string | null;
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "form" | "success" | "error">("loading");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("This invitation link is missing its token.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/v1/org/invitations/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "This invitation link is invalid.");
        }
        setPreview(data);
        setStatus("form");
      } catch (err: any) {
        setStatus("error");
        setError(err.message || "Something went wrong");
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isValidFullName(fullName)) {
      setError("Full name contains invalid characters.");
      return;
    }
    if (!isValidPasswordLength(password)) {
      setError("Password must be between 6 and 16 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/org/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fullName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }
      setStatus("success");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <AuthCard title="Loading your invitation">
        <p className="text-center text-sm text-muted-foreground">One moment…</p>
      </AuthCard>
    );
  }

  if (status === "error") {
    return (
      <AuthCard title="Invitation link">
        <div className={errorClass}>{error}</div>
      </AuthCard>
    );
  }

  if (status === "success") {
    return (
      <AuthCard title="You're all set" subtitle="Open the Ascurix desktop app and sign in with your new password.">
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <a href="/login" className="font-medium text-foreground underline">
            Or sign in from the browser
          </a>
        </p>
      </AuthCard>
    );
  }

  const subtitle =
    preview?.role === "flat"
      ? `Join Ascurix as ${preview.email}.`
      : `Join ${preview?.firmName ?? "your firm"} as ${preview?.role} on Ascurix.`;

  return (
    <AuthCard title="Set up your account" subtitle={subtitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}

        <div>
          <label className={labelClass}>Full name</label>
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
          <label className={labelClass}>Password</label>
          <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" autoComplete="new-password" name="new-password" />
        </div>

        <div>
          <label className={labelClass}>Confirm password</label>
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            name="confirm-password"
          />
        </div>

        <Button type="submit" disabled={submitting} className="mt-2 w-full">
          {submitting ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  );
}
