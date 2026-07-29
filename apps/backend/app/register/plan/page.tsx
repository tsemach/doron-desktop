"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { AuthCard, Button, errorClass } from "@workspace/ui";

function PlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform");
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "unauthenticated") return;
    // /login is a strict superset here -- it has its own "Don't have an
    // account? Create one" link straight to /register (see
    // app/login/page.tsx), so someone who's never registered can still get
    // there in one click, while someone who has an account (e.g.
    // desktop's "Upgrade to Pro", or a plain expired browser session) can
    // actually sign back in instead of being funneled into registration.
    router.replace(platform === "desktop" ? "/login?platform=desktop" : "/login");
  }, [status, platform, router]);

  // A 401 here means the session looked valid to useSession() (it still has
  // the cached user info, e.g. email in the subtitle above) but the server
  // rejected it -- e.g. the underlying user row was deleted after the JWT
  // was issued (see auth.ts's session callback). The JWT cookie itself is
  // still validly signed and unexpired though, so a plain router.push here
  // gets silently bounced right back by middleware.ts -- its isLoggedIn
  // check runs on the edge-safe authConfig (no DB access), which still
  // considers this cookie "logged in". signOut() actually clears the
  // cookie client-side first, so middleware no longer redirects `/login`
  // away, then lands on the real login page.
  async function redirectToLogin() {
    await signOut({ callbackUrl: platform === "desktop" ? "/login?platform=desktop" : "/login" });
  }

  async function selectFree() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "free" }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
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

  async function selectPro() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      // checkoutUrl may be relative (mock provider) or an absolute external
      // URL (a real provider's hosted checkout page) — a full navigation
      // handles both, unlike router.push which only works for the former.
      window.location.href = data.checkoutUrl;
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

        <button
          type="button"
          onClick={selectPro}
          disabled={loading}
          className="rounded-lg border border-primary bg-background p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
        >
          <div className="text-sm font-semibold text-foreground">Pro</div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            $49<span className="text-xs font-normal text-muted-foreground">/mo</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Everything in Free, plus AI-powered features.
          </div>
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {loading ? "Setting up your account…" : "You can switch plans later from your account."}
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
