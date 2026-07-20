"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@workspace/ui";
import AuthCard from "../../../components/auth/AuthCard";
import { errorClass } from "../../../components/auth/formStyles";

function PlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform");
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Not signed in (e.g. direct navigation without registering first) — send back to register.
    if (status === "unauthenticated") {
      router.replace(platform === "desktop" ? "/register?platform=desktop" : "/register");
    }
  }, [status, platform, router]);

  async function selectFree() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "free" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to select plan");
      }
      router.push(platform === "desktop" ? "/register/complete?platform=desktop" : "/");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  }

  if (status !== "authenticated") {
    return null;
  }

  return (
    <AuthCard title="Choose your plan" subtitle={session?.user?.email ?? undefined}>
      {error && <div className={`${errorClass} mb-4`}>{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={selectFree}
          disabled={loading}
          className="rounded-lg border border-primary bg-background p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-foreground">Free</div>
          <div className="mt-1 text-2xl font-bold text-foreground">$0</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Case management, document search, versioning, email — everything except AI features.
          </div>
        </button>

        <div className="rounded-lg border border-border bg-background p-4 text-left opacity-70">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Pro</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Coming soon
            </span>
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">—</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Adds AI-powered features. Billing isn&apos;t live yet — you&apos;ll be started on Free and we&apos;ll let you know when Pro is available.
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {loading ? "Setting up your account…" : "You can pick Pro later once billing is available."}
      </p>
    </AuthCard>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanForm />
    </Suspense>
  );
}
