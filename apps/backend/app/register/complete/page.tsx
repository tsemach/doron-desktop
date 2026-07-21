"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@workspace/ui";
import AuthCard from "../../../components/auth/AuthCard";

function CompleteContent() {
  const searchParams = useSearchParams();
  const isDesktop = searchParams.get("platform") === "desktop";

  return (
    <AuthCard title="You're all set" subtitle="Your Amicus account is ready.">
      <p className="text-center text-sm text-muted-foreground">
        {isDesktop
          ? "Return to the Amicus desktop app and log in with your new account."
          : "You can now sign in from the Amicus desktop app."}
      </p>

      {/* 0.5a — low priority convenience button: brings the desktop app to
          focus if it's already running, or launches it if not, via the same
          doron-desktop:// scheme registered for OAuth login (0.9). Purely a
          convenience — the flow works fine without it (alt-tab back). */}
      {isDesktop && (
        <a href="doron-desktop://" className="mt-6 block">
          <Button type="button" className="w-full">
            Open Amicus
          </Button>
        </a>
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
