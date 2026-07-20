"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@workspace/ui";
import AuthCard from "../../../components/auth/AuthCard";
import { errorClass } from "../../../components/auth/formStyles";

// Stands in for a real hosted checkout page (Paddle, once credentials exist).
// "Confirming" here posts directly to our own webhook route with the shape a
// real provider's webhook would eventually deliver — no money, no external
// provider, but the full checkout -> webhook -> users.tier loop is real.
function MockCheckoutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const platform = searchParams.get("platform");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!userId) {
      setError("Missing user — please restart checkout from the plan page.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/webhooks/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier: "pro" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Payment confirmation failed");
      }
      router.push(platform === "desktop" ? "/register/complete?platform=desktop" : "/");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Mock checkout" subtitle="No real payment provider is connected yet.">
      {error && <div className={`${errorClass} mb-4`}>{error}</div>}

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Amicus Pro</span>
          <span className="text-lg font-bold text-foreground">$49<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
        </div>
      </div>

      <Button type="button" disabled={loading} onClick={confirm} className="mt-4 w-full">
        {loading ? "Confirming…" : "Confirm mock payment"}
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        This page stands in for a real checkout until Paddle credentials are wired up.
      </p>
    </AuthCard>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <MockCheckoutForm />
    </Suspense>
  );
}
