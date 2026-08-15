"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, Button, errorClass } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";

// Stands in for a real hosted checkout page (Paddle, once credentials exist).
// "Confirming" here posts directly to our own webhook route with the shape a
// real provider's webhook would eventually deliver — no money, no external
// provider, but the full checkout -> webhook -> users.tier loop is real.
function MockCheckoutForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const platform = searchParams.get("platform");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!userId) {
      setError(t("mock_checkout_missing_user"));
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
        throw new Error(data.error || t("mock_checkout_failed"));
      }
      router.push(platform === "desktop" ? "/register/complete?platform=desktop" : "/");
    } catch (err: any) {
      setError(err.message || t("plan_something_wrong"));
      setLoading(false);
    }
  }

  return (
    <AuthCard title={t("mock_checkout_title")} subtitle={t("mock_checkout_subtitle")}>
      {error && <div className={`${errorClass} mb-4`}>{error}</div>}

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">{t("profile_plan_pro_name")}</span>
          <span className="text-lg font-bold text-foreground">$49<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
        </div>
      </div>

      <Button type="button" disabled={loading} onClick={confirm} className="mt-4 w-full">
        {loading ? t("mock_checkout_confirming") : t("mock_checkout_confirm_button")}
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">{t("mock_checkout_note")}</p>
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
