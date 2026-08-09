import { Resend } from "resend";
import type { EmailProvider } from "./types";

// Mirrors apps/backend/lib/email/resend-provider.ts -- same service,
// same send call shape, but its own copy (see index.ts's comment on why
// this isn't shared code) and only sendInvitationEmail, since office never
// sends a verification email.
const FROM_ADDRESS = process.env.RESEND_SEND_ADDRESS || "onboarding@resend.dev";

export class ResendEmailProvider implements EmailProvider {
  private client: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    this.client = new Resend(apiKey);
  }

  async sendInvitationEmail(email: string, acceptUrl: string, role: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "You've been invited to Ascurix",
      html: `<p>You've been invited to join Ascurix as a <strong>${role}</strong>.</p><p><a href="${acceptUrl}">${acceptUrl}</a></p><p>This link expires in 7 days.</p>`,
    });

    if (error) {
      throw new Error(`Failed to send invitation email: ${error.message}`);
    }
  }
}
