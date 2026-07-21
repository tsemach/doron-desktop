// Swappable email-sending interface, same pattern as lib/payments/types.ts --
// no email provider (Resend, SES, SMTP, etc.) is set up yet, so this starts
// against a mock implementation that logs to the console instead of sending.
export interface EmailProvider {
  sendVerificationEmail(email: string, verifyUrl: string): Promise<void>;
}
