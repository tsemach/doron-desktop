import type { EmailProvider } from "./types";
import { MockEmailProvider } from "./mock-provider";

// Always mock for now -- unlike apps/backend/lib/email/index.ts, there's no
// ResendEmailProvider (or RESEND_API_KEY) wired up for office yet, since
// nothing here has needed to send real email until this invitation flow.
// Swap point for later: add a resend-provider.ts mirroring the backend's
// and branch on an env var here the same way.
export function getEmailProvider(): EmailProvider {
  return new MockEmailProvider();
}
