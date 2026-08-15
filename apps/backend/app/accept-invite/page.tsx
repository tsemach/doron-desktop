"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard, Button, PasswordInput, errorClass, inputClass, labelClass } from "@workspace/ui";
import { isValidFullName, isValidPasswordLength } from "../../lib/validation";
import { useLanguage } from "../../context/LanguageContext";

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
  const { t } = useLanguage();
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
      setError(t("accept_invite_missing_token"));
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
          throw new Error(data.error || t("accept_invite_invalid"));
        }
        setPreview(data);
        setStatus("form");
      } catch (err: any) {
        setStatus("error");
        setError(err.message || t("plan_something_wrong"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isValidFullName(fullName)) {
      setError(t("register_invalid_name"));
      return;
    }
    if (!isValidPasswordLength(password)) {
      setError(t("register_invalid_password_length"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("register_password_mismatch"));
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
        throw new Error(data.error || t("accept_invite_failed"));
      }
      setStatus("success");
    } catch (err: any) {
      setError(err.message || t("plan_something_wrong"));
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <AuthCard title={t("accept_invite_loading_title")}>
        <p className="text-center text-sm text-muted-foreground">{t("accept_invite_loading")}</p>
      </AuthCard>
    );
  }

  if (status === "error") {
    return (
      <AuthCard title={t("accept_invite_link_title")}>
        <div className={errorClass}>{error}</div>
      </AuthCard>
    );
  }

  if (status === "success") {
    return (
      <AuthCard title={t("complete_title")} subtitle={t("accept_invite_success_subtitle")}>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <a href="/login" className="font-medium text-foreground underline">
            {t("accept_invite_success_browser_link")}
          </a>
        </p>
      </AuthCard>
    );
  }

  const subtitle =
    preview?.role === "flat"
      ? t("accept_invite_join_flat").replace("{email}", preview.email)
      : t("accept_invite_join_firm")
          .replace("{firm}", preview?.firmName ?? t("accept_invite_default_firm"))
          .replace("{role}", preview?.role ?? "");

  return (
    <AuthCard title={t("accept_invite_setup_title")} subtitle={subtitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}

        <div>
          <label className={labelClass}>{t("register_full_name")}</label>
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
          <label className={labelClass}>{t("login_password")}</label>
          <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" autoComplete="new-password" name="new-password" />
        </div>

        <div>
          <label className={labelClass}>{t("register_confirm_password")}</label>
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            name="confirm-password"
          />
        </div>

        <Button type="submit" disabled={submitting} className="mt-2 w-full">
          {submitting ? t("accept_invite_creating") : t("register_create_account")}
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
