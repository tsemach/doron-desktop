"use client";

import { useEffect, useState } from "react";
import AuthCard from "../../../components/auth/AuthCard";
import { errorClass } from "../../../components/auth/formStyles";

// Landing point for the OAuth branch of desktop *login* (0.9) — reached via
// signIn(provider, { callbackUrl: "/auth/desktop-complete" }) from the
// desktop-aware login page. By the time this renders, the NextAuth session
// cookie is already set; this page's only job is to mint a desktop token for
// that session and hand it back to the app via the doron-desktop:// scheme.
export default function DesktopCompletePage() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, []);

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
