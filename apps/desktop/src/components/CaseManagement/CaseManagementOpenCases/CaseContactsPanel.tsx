import { useCallback, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import { useContactList } from "@/hooks/useContactList";
import { useUserRole } from "@/lib/permissions";
import { sessionAtom } from "@/store/authStore";
import { useLanguage } from "@/context/LanguageContext";
import { Contact, ContactFields } from "@/lib/contact/types";
import type { OrgMember } from "@/components/Settings/SettingUsersRolesTable";
import ContactSharePickerDialog from "./ContactSharePickerDialog";
import GoogleContactsImportDialog from "./GoogleContactsImportDialog";
import ContactFormDialog from "./ContactFormDialog";

interface CaseContactsPanelProps {
  caseId: number;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all";

const EMPTY_DRAFT: ContactFields = { name: "", email: "", phone: "", organization: "" };

// Same copy-then-reset-after-a-beat pattern as
// DocsManagementTemplatesForm.tsx's FormFieldItem -- write_clipboard is the
// existing Tauri command for this, no new backend needed.
function CopyEmailButton({ email }: { email: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    invoke("write_clipboard", { text: email }).catch((err) => console.error("Failed to copy email:", err));
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? t("contact_email_copied") : t("contact_copy_email")}
      className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function CaseContactsPanel({ caseId }: CaseContactsPanelProps) {
  const { t } = useLanguage();
  const role = useUserRole();
  const isFlat = role === "flat";
  const session = useAtomValue(sessionAtom);

  const {
    contacts,
    loading,
    error,
    searchableContacts,
    linkExisting,
    createAndLink,
    unlink,
    updateContact,
    shareContact,
    unshareContact,
    reloadAll,
  } = useContactList(caseId);

  // One shared modal for both "New contact" and "Edit contact" -- null means
  // closed, otherwise its mode drives the dialog's title/behavior (see
  // ContactFormDialog.tsx). Replaces the old separate inline-form/inline-edit
  // UI entirely.
  const [formDialog, setFormDialog] = useState<{ mode: "new" } | { mode: "edit"; contact: Contact } | null>(null);

  const [expandedSharesId, setExpandedSharesId] = useState<string | null>(null);
  const [sharePickerContact, setSharePickerContact] = useState<Contact | null>(null);
  const [shareCandidates, setShareCandidates] = useState<OrgMember[]>([]);
  const [shareCandidatesError, setShareCandidatesError] = useState<string | null>(null);

  const [showAddExisting, setShowAddExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGoogleImport, setShowGoogleImport] = useState(false);

  const linkedIds = useMemo(() => new Set(contacts.map((c) => c.id)), [contacts]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return searchableContacts
      .filter((c) => !linkedIds.has(c.id))
      .filter((c) => {
        if (!query) return true;
        return (c.name || "").toLowerCase().includes(query) || c.email.toLowerCase().includes(query);
      })
      .slice(0, 25);
  }, [searchableContacts, linkedIds, searchQuery]);

  const openSharePicker = useCallback(async (contact: Contact) => {
    setSharePickerContact(contact);
    setShareCandidatesError(null);
    try {
      const members = await invoke<OrgMember[]>("list_org_members");
      // Exclude the contact's own owner (the current user -- Share only ever
      // renders on ownedByMe rows, so that's always whoever is signed in --
      // and anyone it's already shared with) -- sharing with yourself, or
      // re-sharing with an existing recipient, is meaningless.
      setShareCandidates(
        members.filter((m) => m.email !== session?.email && !contact.sharedWith.includes(m.id))
      );
    } catch (err) {
      console.error(err);
      setShareCandidatesError("Failed to load your firm's members.");
    }
  }, [session?.email]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("contacts")} ({contacts.length})
        </h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddExisting((v) => !v)}
            className="p-1.5 rounded-md border-0 shadow-[0_0_0_1px_var(--border)] bg-background text-xs text-foreground hover:bg-accent transition-all cursor-pointer px-2.5"
          >
            {t("contact_add_existing")}
          </button>
          <div className="rounded-lg bg-primary h-7 px-2.5 inline-flex items-center">
            <button
              type="button"
              onClick={() => setFormDialog({ mode: "new" })}
              className="inline-flex items-center gap-0.5 text-xs text-primary-foreground hover:underline hover:text-primary-foreground/80 font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              {t("contact_new_contact")}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {showAddExisting && (
        <div className="max-w-2xl rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("contact_search_placeholder")}
              className={`${inputClass} flex-1`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowGoogleImport(true)}
              className="shrink-0 rounded-md bg-primary text-xs text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer px-2.5 py-1"
            >
              {t("contact_import_google")}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-border">
            {searchResults.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No matching contacts.</p>
            ) : (
              searchResults.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{c.name || c.email}</p>
                    {c.name && <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => linkExisting(c.id)}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-foreground px-2 py-1 rounded-md border border-blue-200/60 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                    {t("contact_add")}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t("contact_no_contacts")}</div>
      ) : (
        <div className="max-w-2xl space-y-2">
          {contacts.map((contact) => {
            return (
              <div key={contact.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div
                  className={`min-w-0 ${contact.canEdit ? "cursor-pointer" : ""}`}
                  onClick={contact.canEdit ? () => setFormDialog({ mode: "edit", contact }) : undefined}
                  title={contact.canEdit ? t("contact_edit_contact") : undefined}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{contact.name || contact.email}</p>
                    {!contact.name && <CopyEmailButton email={contact.email} />}
                  </div>
                  <div className="flex items-center gap-1 min-w-0">
                    {contact.name && (
                      <>
                        <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                        <CopyEmailButton email={contact.email} />
                      </>
                    )}
                    {(contact.phone || contact.organization) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.name && "· "}
                        {[contact.phone, contact.organization].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {contact.canEdit && (
                      <button
                        type="button"
                        onClick={() => setFormDialog({ mode: "edit", contact })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-foreground px-2 py-1 rounded-md border border-blue-200/60 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                        {t("contact_edit_contact")}
                      </button>
                    )}

                    {!isFlat && contact.ownedByMe && (
                      <button
                        type="button"
                        onClick={() => openSharePicker(contact)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-foreground px-2 py-1 rounded-md border border-blue-200/60 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                          <path d="M16 6l-4-4-4 4" />
                          <path d="M12 2v13" />
                        </svg>
                        {t("contact_share")}
                      </button>
                    )}

                    {!isFlat && contact.ownedByMe && contact.sharedWith.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedSharesId((id) => (id === contact.id ? null : contact.id))}
                        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {t("contact_shared_with")} ({contact.sharedWith.length})
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => unlink(contact.id)}
                    className="text-xs text-destructive hover:underline cursor-pointer"
                  >
                    {t("contact_unlink")}
                  </button>
                </div>

                {!isFlat && expandedSharesId === contact.id && contact.sharedWith.length > 0 && (
                  <div className="rounded-md bg-muted/40 p-2 space-y-1">
                    {contact.sharedWith.map((recipientUserId) => (
                      <div key={recipientUserId} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground font-mono truncate">{recipientUserId}</span>
                        <button
                          type="button"
                          onClick={() => unshareContact(contact.id, recipientUserId)}
                          className="text-[11px] text-destructive hover:underline cursor-pointer shrink-0"
                        >
                          {t("contact_unshare")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formDialog && (
        <ContactFormDialog
          mode={formDialog.mode}
          initialValues={
            formDialog.mode === "new"
              ? EMPTY_DRAFT
              : {
                  name: formDialog.contact.name || "",
                  email: formDialog.contact.email,
                  phone: formDialog.contact.phone || "",
                  organization: formDialog.contact.organization || "",
                }
          }
          onSubmit={async (fields) => {
            if (formDialog.mode === "new") {
              // Omit empty optional fields on create -- matches the old inline
              // "New contact" form's behavior.
              await createAndLink({
                name: fields.name || undefined,
                email: fields.email,
                phone: fields.phone || undefined,
                organization: fields.organization || undefined,
              });
            } else {
              // Send explicit "" (not omitted) on edit -- the backend treats a
              // missing/undefined field as "keep existing", not "clear", so an
              // intentionally-emptied field must be sent as "" to actually clear
              // it. update_contact never takes email (immutable, design.md §6).
              await updateContact(formDialog.contact.id, {
                name: fields.name || "",
                phone: fields.phone || "",
                organization: fields.organization || "",
              });
            }
            setFormDialog(null);
          }}
          onCancel={() => setFormDialog(null)}
        />
      )}

      {sharePickerContact && (
        <ContactSharePickerDialog
          candidates={shareCandidates}
          onShare={async (recipientUserId) => {
            await shareContact(sharePickerContact.id, recipientUserId);
            setSharePickerContact(null);
          }}
          onCancel={() => setSharePickerContact(null)}
        />
      )}
      {sharePickerContact && shareCandidatesError && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24 pointer-events-none">
          <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive shadow-lg">
            {shareCandidatesError}
          </div>
        </div>
      )}

      {showGoogleImport && (
        <GoogleContactsImportDialog
          caseId={caseId}
          onImported={reloadAll}
          onCancel={() => setShowGoogleImport(false)}
        />
      )}
    </div>
  );
}
