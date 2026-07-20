import type { EmailProvider } from "./types";

// No real email provider is connected yet -- this logs the verification link
// to the server console instead of sending it, so the full
// signup -> verify -> login loop is real and testable without needing a
// real inbox. Check the backend server's console output for the link.
export class MockEmailProvider implements EmailProvider {
  async sendVerificationEmail(email: string, verifyUrl: string): Promise<void> {
    console.log(`[MockEmailProvider] Verification link for ${email}:\n${verifyUrl}`);
  }
}
