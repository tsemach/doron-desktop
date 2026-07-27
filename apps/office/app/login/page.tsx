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
    </AuthCard>
  );
}
