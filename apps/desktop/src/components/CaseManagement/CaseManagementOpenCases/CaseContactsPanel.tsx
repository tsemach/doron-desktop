import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import { useContactList } from "@/hooks/useContactList";
import { useUserRole } from "@/lib/permissions";
import { sessionAtom } from "@/store/authStore";
import { useLanguage } from "@/context/LanguageContext";
import { Contact, ContactFields } from "@/lib/contact/types";
import type { OrgMember } from "@/components/Settings/SettingUsersRolesTable";
import ContactSharePickerDialog from "./ContactSharePickerDialog";

interface CaseContactsPanelProps {
  caseId: number;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all";

const EMPTY_DRAFT: ContactFields = { name: "", email: "", phone: "", organization: "" };

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
  } = useContactList(caseId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ContactFields>(EMPTY_DRAFT);

  const [expandedSharesId, setExpandedSharesId] = useState<string | null>(null);
  const [sharePickerContact, setSharePickerContact] = useState<Contact | null>(null);
  const [shareCandidates, setShareCandidates] = useState<OrgMember[]>([]);
  const [shareCandidatesError, setShareCandidatesError] = useState<string | null>(null);

  const [showAddExisting, setShowAddExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactDraft, setNewContactDraft] = useState<ContactFields>(EMPTY_DRAFT);

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

  function startEdit(contact: Contact) {
    setEditingId(contact.id);
    setEditDraft({
      name: contact.name || "",
      email: contact.email,
      phone: contact.phone || "",
      organization: contact.organization || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  }

  async function saveEdit(id: string) {
    // Backend treats a missing/null field as "keep existing" (not "clear"), so
    // sending trimmed values back for every editable field is safe here --
    // update_contact never takes email (immutable per docs/contact/design.md §6).
    await updateContact(id, {
      name: editDraft.name?.trim() || "",
      phone: editDraft.phone?.trim() || "",
      organization: editDraft.organization?.trim() || "",
    });
    cancelEdit();
  }

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

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newContactDraft.email.trim() || !newContactDraft.email.includes("@")) return;
    await createAndLink({
      name: newContactDraft.name?.trim() || undefined,
      email: newContactDraft.email.trim(),
      phone: newContactDraft.phone?.trim() || undefined,
      organization: newContactDraft.organization?.trim() || undefined,
    });
    setNewContactDraft(EMPTY_DRAFT);
    setShowNewContact(false);
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("contacts")} ({contacts.length})
        </h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAddExisting((v) => !v);
              setShowNewContact(false);
            }}
            className="p-1.5 rounded-md border-0 shadow-[0_0_0_1px_var(--border)] bg-background text-xs text-foreground hover:bg-accent transition-all cursor-pointer px-2.5"
          >
            {t("contact_add_existing")}
          </button>
          <div className="rounded-lg bg-primary h-7 px-2.5 inline-flex items-center">
            <button
              type="button"
              onClick={() => {
                setShowNewContact((v) => !v);
                setShowAddExisting(false);
              }}
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
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("contact_search_placeholder")}
            className={inputClass}
            autoFocus
          />
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
                    className="shrink-0 text-xs text-primary hover:underline font-medium cursor-pointer"
                  >
                    {t("contact_add")}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showNewContact && (
        <form onSubmit={handleCreateContact} className="max-w-2xl rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newContactDraft.name}
              onChange={(e) => setNewContactDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder={t("contact_name_placeholder")}
              className={inputClass}
            />
            <input
              type="email"
              value={newContactDraft.email}
              onChange={(e) => setNewContactDraft((d) => ({ ...d, email: e.target.value }))}
              placeholder={t("contact_email_placeholder")}
              className={inputClass}
              required
            />
            <input
              type="text"
              value={newContactDraft.phone}
              onChange={(e) => setNewContactDraft((d) => ({ ...d, phone: e.target.value }))}
              placeholder={t("contact_phone_placeholder")}
              className={inputClass}
            />
            <input
              type="text"
              value={newContactDraft.organization}
              onChange={(e) => setNewContactDraft((d) => ({ ...d, organization: e.target.value }))}
              placeholder={t("contact_organization_placeholder")}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewContact(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            >
              {t("contact_add")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading contacts...</div>
      ) : contacts.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t("contact_no_contacts")}</div>
      ) : (
        <div className="max-w-2xl space-y-2">
          {contacts.map((contact) => {
            const isEditing = editingId === contact.id;
            return (
              <div key={contact.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder={t("contact_name_placeholder")}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={editDraft.email}
                      disabled
                      className={`${inputClass} opacity-60 cursor-not-allowed`}
                    />
                    <input
                      type="text"
                      value={editDraft.phone}
                      onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                      placeholder={t("contact_phone_placeholder")}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={editDraft.organization}
                      onChange={(e) => setEditDraft((d) => ({ ...d, organization: e.target.value }))}
                      placeholder={t("contact_organization_placeholder")}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{contact.name || contact.email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[contact.name ? contact.email : null, contact.phone, contact.organization]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {contact.canEdit &&
                      (isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveEdit(contact.id)}
                            className="text-xs text-primary hover:underline font-medium cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(contact)}
                          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Edit
                        </button>
                      ))}

                    {!isFlat && contact.ownedByMe && (
                      <button
                        type="button"
                        onClick={() => openSharePicker(contact)}
                        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                      >
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
    </div>
  );
}
