import type { EmailProvider } from "./types";
import { MockEmailProvider } from "./mock-provider";
import { ResendEmailProvider } from "./resend-provider";

// Same conditional as apps/backend/lib/email/index.ts: Resend once
// RESEND_API_KEY is set, mock otherwise (e.g. a dev environment that
// hasn't configured it) -- lets this run with zero email config and pick
// up the real provider the moment a key is added, no code change needed.
export function getEmailProvider(): EmailProvider {
  return process.env.RESEND_API_KEY ? new ResendEmailProvider() : new MockEmailProvider();
}
