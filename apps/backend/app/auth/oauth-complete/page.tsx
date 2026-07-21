"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthCard from "../../../components/auth/AuthCard";

// Landing point for plain-web Google/Facebook sign-in, from either the
// register or login page's social buttons -- OAuth doesn't distinguish
// "I clicked Register" from "I clicked Login" (Google/Facebook don't know
// or care), so both point here and this page is what decides whether this
// is a fresh account (never chosen a plan -> /register/plan) or a returning
// one (-> straight into the app), based on users.planSelectedAt.
export default function OAuthCompletePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const planSelectedAt = (session?.user as { planSelectedAt?: string | Date | null } | undefined)?.planSelectedAt;
    router.replace(planSelectedAt ? "/" : "/register/plan");
  }, [status, session, router]);

  return (
    <AuthCard title="Signing you in">
      <p className="text-center text-sm text-muted-foreground">One moment…</p>
    </AuthCard>
  );
}
