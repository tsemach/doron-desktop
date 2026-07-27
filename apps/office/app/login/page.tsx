"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { AuthCard, Button, PasswordInput, errorClass, inputClass, labelClass } from "@workspace/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }
      // Hard navigation (not client-side routing) so the browser's password
      // manager reliably offers to save the credential -- see
      // apps/backend/app/login/page.tsx for the same fix and why it's needed.
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    setError("");
    setLoading(true);
    try {
      // Only pre-provisioned admin_users rows can actually sign in this way
      // -- auth.ts's signIn callback rejects any email that isn't already
      // an admin, so this never auto-creates an account.
      await signIn(provider, { callbackUrl: "/" });
    } catch {
      setError(`Failed to start ${provider} sign-in`);
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Amicus Back Office">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && <div className={errorClass}>{error}</div>}

        <div>
          <label className={labelClass}>Email address</label>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@amicus.com"
          />
        </div>

        <div>
          <label className={labelClass}>Password</label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            name="password"
          />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Signing in…" : "Sign in"}
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
    </AuthCard>
  );
}
