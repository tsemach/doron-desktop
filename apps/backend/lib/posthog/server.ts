import { PostHog } from "posthog-node";

let client: PostHog | undefined;

/**
 * Server-side PostHog client singleton -- reuses the same project token the
 * client-side SDK uses (apps/backend/app/providers.tsx), not a separate
 * server-only credential. Event capture doesn't need the Personal API Key;
 * that's only for local feature-flag evaluation, which isn't used here.
 */
export function getPostHogClient(): PostHog {
  if (!client) {
    client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? "", {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    });
  }
  return client;
}
