"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@workspace/ui";
import AuthCard from "../../components/auth/AuthCard";
import PasswordInput from "../../components/auth/PasswordInput";
import { errorClass, inputClass, labelClass } from "../../components/auth/formStyles";
import { isValidEmail, isValidFullName, isValidPasswordLength } from "../../lib/validation";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform"); // "desktop" when opened from the Amicus desktop app

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // After registration: desktop-originated signups continue to plan selection
  // (0.4); plain web signups keep today's behavior and land on the portal home.
  const nextUrl = platform === "desktop" ? "/register/plan?platform=desktop" : "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side checks are only for immediate feedback -- the signup route
    // enforces the same rules server-side and is the actual source of truth.
    if (!isValidFullName(fullName)) {
      setError("Full name contains invalid characters.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
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

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      // No auto sign-in -- login is blocked until the email is verified
      // (lib/verifyCredentials.ts), so the account isn't usable yet.
      const params = new URLSearchParams({ email });
      if (platform === "desktop") params.set("platform", "desktop");
      router.push(`/register/check-email?${params.toString()}`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    setError("");
    setLoading(true);
    try {
      await signIn(provider, { callbackUrl: nextUrl });
    } catch {
      setError(`Failed to start ${provider} sign-up`);
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your Amicus account" subtitle="Set up your account, then choose a plan.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}

        <div>
          <label className={labelClass}>Full name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder="Jane Cohen"
          />
        </div>

        <div>
          <label className={labelClass}>Email address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className={labelClass}>Password</label>
          <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" autoComplete="new-password" />
        </div>

        <div>
          <label className={labelClass}>Confirm password</label>
          <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" autoComplete="new-password" />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Or continue with
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" type="button" disabled={loading} onClick={() => handleSocial("google")}>
          Google
        </Button>
        <Button variant="outline" type="button" disabled={loading} onClick={() => handleSocial("facebook")}>
          Facebook
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <a href={platform === "desktop" ? "/login?platform=desktop" : "/login"} className="font-medium text-foreground underline">
          Sign in
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
