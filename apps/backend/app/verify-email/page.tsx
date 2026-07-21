"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AuthCard from "../../components/auth/AuthCard";
import { errorClass } from "../../components/auth/formStyles";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const platform = searchParams.get("platform");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email || !token) {
      setStatus("error");
      setError("This verification link is missing required information.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Verification failed");
        }
        setStatus("success");
      } catch (err: any) {
        setStatus("error");
        setError(err.message || "Something went wrong");
      }
    })();
  }, [email, token]);

  // A desktop-originated registration deep-links straight back into the
  // desktop app's own login form (doron-desktop://login, handled in
  // apps/desktop/src-tauri/src/lib.rs) instead of opening a second,
  // browser-based login -- the user already has the app open.
  const isDesktop = platform === "desktop";
  const loginUrl = isDesktop ? "doron-desktop://login" : "/login?justVerified=1";

  return (
    <AuthCard title="Verify your email">
      {status === "verifying" && <p className="text-center text-sm text-muted-foreground">Verifying…</p>}
      {status === "success" && (
        <div className="text-center">
          <p className="text-sm text-foreground">Your email is verified.</p>
          <a href={loginUrl} className="mt-4 inline-block font-medium text-foreground underline">
            {isDesktop ? "Return to the Amicus app to sign in" : "Continue to sign in"}
          </a>
        </div>
      )}
      {status === "error" && (
        <div className={errorClass}>{error}</div>
      )}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
