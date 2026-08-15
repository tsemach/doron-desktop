"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";

function CompleteContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = searchParams.get("platform") === "desktop";

  // 0.5a — brings the desktop app to focus (and onto its login screen, via
  // lib.rs's doron-desktop://login handler) if it's already running, or
  // launches it if not. A custom-scheme navigation doesn't take the browser
  // tab away on its own, so this page then sends itself back to the portal
  // home instead of sitting on "You're all set" forever.
  function handleOpenAscurix() {
    window.location.href = "doron-desktop://login";
    setTimeout(() => router.push("/"), 300);
  }

  return (
    <AuthCard title={t("complete_title")} subtitle={t("complete_subtitle")}>
      <p className="text-center text-sm text-muted-foreground">
        {isDesktop ? t("complete_desktop_note") : t("complete_browser_note")}
      </p>

      {isDesktop && (
        <Button type="button" onClick={handleOpenAscurix} className="mt-6 w-full">
          {t("complete_open_ascurix")}
        </Button>
      )}
    </AuthCard>
  );
}

export default function CompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteContent />
    </Suspense>
  );
}
