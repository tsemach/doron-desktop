"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AuthCard } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";

// Landing point for plain-web Google/Facebook sign-in, from either the
// register or login page's social buttons -- OAuth doesn't distinguish
// "I clicked Register" from "I clicked Login" (Google/Facebook don't know
// or care), so both point here and this page is what decides whether this
// is a fresh account (never chosen a plan -> /register/plan) or a returning
// one (-> straight into the app), based on users.planSelectedAt.
export default function OAuthCompletePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const planSelectedAt = (session?.user as { planSelectedAt?: string | Date | null } | undefined)?.planSelectedAt;
    router.replace(planSelectedAt ? "/" : "/register/plan");
  }, [status, session, router]);

  return (
    <AuthCard title={t("signing_in_title")}>
      <p className="text-center text-sm text-muted-foreground">{t("accept_invite_loading")}</p>
    </AuthCard>
  );
}
