// Swappable email-sending interface, same pattern as lib/payments/types.ts --
// no email provider (Resend, SES, SMTP, etc.) is set up yet, so this starts
// against a mock implementation that logs to the console instead of sending.
export interface EmailProvider {
  sendVerificationEmail(email: string, verifyUrl: string): Promise<void>;
  // ASC-142 -- role is a plain string (not imported from lib/permissions)
  // to keep this module boundary free of the org/permissions dependency
  // graph; callers pass one of "admin" | "manager" | "user" | "flat".
  sendInvitationEmail(email: string, acceptUrl: string, role: string): Promise<void>;
}
