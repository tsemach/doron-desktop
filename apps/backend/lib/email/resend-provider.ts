import { Resend } from "resend";
import type { EmailProvider } from "./types";

// onboarding@resend.dev works without verifying a custom domain, but
// Resend's own docs say explicitly not to use it in production -- swap
// RESEND_SEND_ADDRESS to a verified-domain address once one exists.
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

  async sendVerificationEmail(email: string, verifyUrl: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Verify your Amicus account",
      html: `<p>Click the link below to verify your email and finish setting up your Amicus account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
    });

    if (error) {
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }
}
