"use client";

import { useState } from "react";
import { AuthCard, Button, PasswordInput, errorClass, inputClass, labelClass } from "@workspace/ui";
import { isValidEmail, isValidFullName, isValidPasswordLength } from "../../lib/validation";

// Reachable only while signed in (middleware.ts protects everything except
// /login) -- an existing admin creates another admin's account here.
// There's no public self-service signup, unlike apps/backend.
export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      const res = await fetch("/api/v1/admin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create admin account");
      }
      window.location.href = "/login";
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Add an admin" subtitle="Create another back-office account.">
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
          <label className={labelClass}>Email address</label>
          <input
            type="email"
            name="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@ascurix.com"
          />
        </div>

        <div>
          <label className={labelClass}>Password</label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            name="new-password"
          />
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

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? "Creating…" : "Create admin account"}
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
