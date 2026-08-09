// ASC-142 -- swappable email-sending interface, same pattern as
// apps/backend/lib/email/types.ts. Kept as its own small copy (not a
// shared module) rather than importing across apps -- mirrors how
// document_templates is already duplicated between the two apps. Office
// only ever needs to send one kind of email (a firm-admin invitation), so
// this interface is smaller than the backend's.
export interface EmailProvider {
  sendInvitationEmail(email: string, acceptUrl: string, role: string): Promise<void>;
}
