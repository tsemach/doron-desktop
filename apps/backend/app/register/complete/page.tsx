"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, Button } from "@workspace/ui";

function CompleteContent() {
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
    <AuthCard title="You're all set" subtitle="Your Ascurix account is ready.">
      <p className="text-center text-sm text-muted-foreground">
        {isDesktop
          ? "Return to the Ascurix desktop app and log in with your new account."
          : "You can now sign in from the Ascurix desktop app."}
      </p>

      {isDesktop && (
        <Button type="button" onClick={handleOpenAscurix} className="mt-6 w-full">
          Open Ascurix
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
