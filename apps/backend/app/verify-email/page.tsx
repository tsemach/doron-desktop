"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard, errorClass } from "@workspace/ui";
import { useLanguage } from "../../context/LanguageContext";

function VerifyEmailContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const platform = searchParams.get("platform");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!email || !token) {
      setStatus("error");
      setError(t("verify_email_missing_info"));
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
          throw new Error(data.error || t("verify_email_failed"));
        }
        setStatus("success");
      } catch (err: any) {
        setStatus("error");
        setError(err.message || t("plan_something_wrong"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, token]);

  // A desktop-originated registration deep-links straight back into the
  // desktop app's own login form (doron-desktop://login, handled in
  // apps/desktop/src-tauri/src/lib.rs) instead of opening a second,
  // browser-based login -- the user already has the app open.
  const isDesktop = platform === "desktop";
  const loginUrl = isDesktop ? "doron-desktop://login" : "/login?justVerified=1";

  return (
    <AuthCard title={t("verify_email_title")}>
      {status === "verifying" && <p className="text-center text-sm text-muted-foreground">{t("verify_email_verifying")}</p>}
      {status === "success" && (
        <div className="text-center">
          <p className="text-sm text-foreground">{t("verify_email_success")}</p>
          <a href={loginUrl} className="mt-4 inline-block font-medium text-foreground underline">
            {isDesktop ? t("verify_email_return_desktop") : t("verify_email_continue")}
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
