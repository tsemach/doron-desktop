import type { EmailProvider } from "./types";

// No real email provider is connected for apps/office yet -- logs the
// invitation link to the server console instead of sending it, same
// approach apps/backend/lib/email/mock-provider.ts uses (and the same
// reason: nothing to swap to until a provider/domain is actually set up).
export class MockEmailProvider implements EmailProvider {
  async sendInvitationEmail(email: string, acceptUrl: string, role: string): Promise<void> {
    console.log(`[MockEmailProvider] Invitation (role: ${role}) for ${email}:\n${acceptUrl}`);
  }
}
