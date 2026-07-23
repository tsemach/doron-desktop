"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthCard from "../../../components/auth/AuthCard";
import { errorClass } from "../../../components/auth/formStyles";

// Landing point for the OAuth branch of desktop *login* (0.9) — reached via
// signIn(provider, { callbackUrl: "/auth/desktop-complete" }) from either
// the desktop-aware register or login page (Google/Facebook don't
// distinguish those two). By the time this renders, the NextAuth session
// cookie is already set. First checks users.planSelectedAt -- a brand-new
// account (or one that registered but never finished plan selection) goes
// to /register/plan instead of straight into the desktop app, same as the
// web equivalent (oauth-complete/page.tsx).
export default function DesktopCompletePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;

    const planSelectedAt = (session?.user as { planSelectedAt?: string | Date | null } | undefined)?.planSelectedAt;
    if (!planSelectedAt) {
      router.replace("/register/plan?platform=desktop");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/desktop-token", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to complete sign-in");
        }
        if (cancelled) return;
        const params = new URLSearchParams({
          token: data.token,
          email: data.email,
          tier: data.tier,
          expires_at: data.expiresAt,
          // Persisted alongside the session on the desktop side (see
          // auth/mod.rs's Session.backend_url) so internal Rust callers
          // that only have an AppHandle can still reach the backend for
          // online-mode AI requests, without needing this threaded through
          // from the frontend at every call site.
          backend_url: window.location.origin,
        });
        const url = `doron-desktop://auth?${params.toString()}`;
        setDeepLink(url);
        window.location.href = url;
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Something went wrong");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, session, router]);

  return (
    <AuthCard title="Signing you in" subtitle="Completing your Amicus desktop login.">
      {error ? (
        <div className={errorClass}>{error}</div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {deepLink ? (
            <>
              If the app didn&apos;t open automatically,{" "}
              <a href={deepLink} className="font-medium text-foreground underline">
                click here
              </a>
              .
            </>
          ) : (
            "One moment…"
          )}
        </p>
      )}
    </AuthCard>
  );
}
