// Mirrors the Rust `Contact` struct's wire shape exactly
// (apps/desktop/src-tauri/src/contact/mod.rs) -- camelCase, matching that
// struct's explicit serde renames. Contact data (name/email/phone/organization)
// is never stored locally; every field here comes live from the backend on
// every load (docs/contact/design.md §3.2).
export interface Contact {
  id: string; // uuid
  name: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  source: "manual" | "email" | "case_creation" | "google";
  ownedByMe: boolean;
  canEdit: boolean;
  updatedByUserId: string | null;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

// Fields accepted by create_contact / update_contact -- name/phone/organization
// are all optional, only email is mandatory (design.md §3.2).
export interface ContactFields {
  name?: string;
  email: string;
  phone?: string;
  organization?: string;
}
