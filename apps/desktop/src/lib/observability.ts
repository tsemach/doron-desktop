import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

export function initObservability() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  if (posthogKey) {
    // Session replay explicitly disabled -- this webview displays real
    // case/document/client content on screen; screen recordings leaving
    // the device to a third party isn't an acceptable default here (same
    // call already made for Sentry's own separate replay feature and the
    // backend's PostHog init).
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST,
      disable_session_recording: true,
      person_profiles: "identified_only",
    });
  }
}
