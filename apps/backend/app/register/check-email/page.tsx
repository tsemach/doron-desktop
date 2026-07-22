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
