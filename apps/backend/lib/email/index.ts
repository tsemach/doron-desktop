import type { EmailProvider } from "./types";
import { MockEmailProvider } from "./mock-provider";
import { ResendEmailProvider } from "./resend-provider";

// Resend once RESEND_API_KEY is set, mock otherwise -- lets the app run
// with zero email config (dev/early-stage) and pick up the real provider
// the moment a key is added, no code change needed.
export function getEmailProvider(): EmailProvider {
  return process.env.RESEND_API_KEY ? new ResendEmailProvider() : new MockEmailProvider();
}
