"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard from "../../../components/auth/AuthCard";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <AuthCard title="Check your email" subtitle={email ?? undefined}>
      <p className="text-center text-sm text-muted-foreground">
        We&apos;ve sent a verification link to this address. Click it to continue.
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        No email provider is connected yet (mock mode) — check the backend server&apos;s console output for the link instead of your inbox.
      </p>
    </AuthCard>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}
