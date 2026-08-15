"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AuthCard, errorClass } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";

// Landing point for the OAuth branch of desktop *login* (0.9) — reached via
// signIn(provider, { callbackUrl: "/auth/desktop-complete" }) from either
// the desktop-aware register or login page (Google/Facebook don't
// distinguish those two). By the time this renders, the NextAuth session
// cookie is already set. First checks users.planSelectedAt -- a brand-new
// account (or one that registered but never finished plan selection) goes
// to /register/plan instead of straight into the desktop app, same as the
// web equivalent (oauth-complete/page.tsx).
export default function DesktopCompletePage() {
  const { t } = useLanguage();
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
          throw new Error(data.error || t("desktop_complete_failed"));
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
          // ASC-142/ASC-143 -- role always present; firm_id/name omitted
          // (not appended) rather than sent as the literal string "null",
          // which URLSearchParams would otherwise produce from a null value.
          role: data.role,
          ...(data.firmId ? { firm_id: data.firmId } : {}),
          ...(data.name ? { name: data.name } : {}),
        });
        const url = `doron-desktop://auth?${params.toString()}`;
        setDeepLink(url);
        window.location.href = url;
      } catch (err: any) {
        if (!cancelled) setError(err.message || t("plan_something_wrong"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, router]);

  return (
    <AuthCard title={t("signing_in_title")} subtitle={t("desktop_complete_subtitle")}>
      {error ? (
        <div className={errorClass}>{error}</div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          {deepLink ? (
            <>
              {t("desktop_complete_not_opened")}{" "}
              <a href={deepLink} className="font-medium text-foreground underline">
                {t("desktop_complete_click_here")}
              </a>
              .
            </>
          ) : (
            t("accept_invite_loading")
          )}
        </p>
      )}
    </AuthCard>
  );
}
