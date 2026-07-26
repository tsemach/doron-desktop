"use client";

import { PostHogProvider } from "posthog-js/react";

// Session replay explicitly disabled -- this portal can show account/case
// info, and screen recordings leaving the device to a third party isn't an
// acceptable default here (same call already made for Sentry's own separate
// replay feature).
export default function Providers({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!apiKey) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        disable_session_recording: true,
        person_profiles: "identified_only",
      }}
    >
      {children}
    </PostHogProvider>
  );
}
