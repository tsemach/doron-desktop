"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthCard, Button, PasswordInput, errorClass, inputClass, labelClass } from "@workspace/ui";
import { isValidEmail, isValidFullName, isValidPasswordLength } from "../../lib/validation";
import { useLanguage } from "../../context/LanguageContext";

function RegisterForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform"); // "desktop" when opened from the Ascurix desktop app

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Google/Facebook here don't distinguish "register" from "login" -- both
  // this button and login/page.tsx's equivalent point at the same landing
  // pages, which decide fresh-account-needs-a-plan vs returning-user based
  // on users.planSelectedAt (desktop-complete does the same check before
  // minting a session).
  const oauthCallbackUrl = platform === "desktop" ? "/auth/desktop-complete" : "/auth/oauth-complete";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side checks are only for immediate feedback -- the signup route
    // enforces the same rules server-side and is the actual source of truth.
    if (!isValidFullName(fullName)) {
      setError(t("register_invalid_name"));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t("login_invalid_email"));
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

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("register_signup_failed"));
      }

      // No auto sign-in -- login is blocked until the email is verified
      // (lib/verifyCredentials.ts), so the account isn't usable yet.
      const params = new URLSearchParams({ email });
      if (platform === "desktop") params.set("platform", "desktop");
      router.push(`/register/check-email?${params.toString()}`);
    } catch (err: any) {
      setError(err.message || t("login_unexpected_error"));
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    setError("");
    setLoading(true);
    try {
      await signIn(provider, { callbackUrl: oauthCallbackUrl });
    } catch {
      setError(t("register_social_failed"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title={t("register_title")} subtitle={t("register_subtitle")}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}

        <div>
          <label className={labelClass}>{t("login_email")}</label>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

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
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            name="new-password"
          />
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

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? t("register_creating") : t("register_create_account")}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("login_or_continue")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" type="button" disabled={loading} onClick={() => handleSocial("google")}>
          {t("login_google")}
        </Button>
        <Button variant="outline" type="button" disabled={loading} onClick={() => handleSocial("facebook")}>
          {t("login_facebook")}
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t("register_already_have_account")}{" "}
        <a href={platform === "desktop" ? "/login?platform=desktop" : "/login"} className="font-medium text-foreground underline">
          {t("register_sign_in")}
        </a>
      </p>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
