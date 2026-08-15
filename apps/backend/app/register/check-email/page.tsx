"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";

function CheckEmailContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <AuthCard title={t("check_email_title")} subtitle={email ?? undefined}>
      <p className="text-center text-sm text-muted-foreground">{t("check_email_desc")}</p>
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
