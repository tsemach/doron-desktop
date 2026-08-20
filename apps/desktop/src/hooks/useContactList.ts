import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Contact, ContactFields } from "@/lib/contact/types";

/// Case-scoped contacts list/mutation state, mirroring useTaskList/useMeetingList's
/// load/mutate/reload shape (see those hooks) -- contacts are simpler than tasks (no
/// reordering, no status enum), so plain useState covers it without a reducer.
///
/// Also loads `searchableContacts` -- the full list of contacts the current user can
/// see (`list_contacts`, own + shared-with-them, or the whole flat pool per
/// docs/contact/design.md §5) -- needed by CaseContactsPanel's "Add existing" search,
/// separately from the case-linked `contacts` list.
///
/// Error handling follows this file's existing convention elsewhere in the app
/// (useTaskList/CaseTasksPanel): `alert()` for a failed mutation, `console.error` +
/// a state `error` string for a failed load.
export function useContactList(caseId: number) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchableContacts, setSearchableContacts] = useState<Contact[]>([]);
  const [searchableLoading, setSearchableLoading] = useState(true);
  const [searchableError, setSearchableError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Contact[]>("list_contacts_for_case", { caseId });
      setContacts(result);
    } catch (err) {
      console.error(err);
      setError("Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const reloadSearchable = useCallback(async () => {
    setSearchableLoading(true);
    setSearchableError(null);
    try {
      const result = await invoke<Contact[]>("list_contacts");
      setSearchableContacts(result);
    } catch (err) {
      console.error(err);
      setSearchableError("Failed to load your contacts.");
    } finally {
      setSearchableLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    reloadSearchable();
  }, [reloadSearchable]);

  const reloadAll = useCallback(async () => {
    await Promise.all([reload(), reloadSearchable()]);
  }, [reload, reloadSearchable]);

  const linkExisting = useCallback(
    async (contactId: string) => {
      try {
        await invoke("add_contact_to_case", { caseId, backendContactId: contactId, source: "manual" });
        await reload();
      } catch (err) {
        console.error(err);
        alert(`Error adding contact to case: ${err}`);
      }
    },
    [caseId, reload]
  );

  const createAndLink = useCallback(
    async (fields: ContactFields) => {
      try {
        const created = await invoke<Contact>("create_contact", {
          name: fields.name || null,
          email: fields.email,
          phone: fields.phone || null,
          organization: fields.organization || null,
        });
        await invoke("add_contact_to_case", { caseId, backendContactId: created.id, source: "manual" });
        await reloadAll();
      } catch (err) {
        console.error(err);
        alert(`Error creating contact: ${err}`);
      }
    },
    [caseId, reloadAll]
  );

  // Never calls delete_contact -- unlinking from a case must never delete the
  // contact from the owner's global list (docs/contact/design.md §4.5).
  const unlink = useCallback(
    async (contactId: string) => {
      try {
        await invoke("remove_contact_from_case", { caseId, backendContactId: contactId });
        await reload();
      } catch (err) {
        console.error(err);
        alert(`Error removing contact from case: ${err}`);
      }
    },
    [caseId, reload]
  );

  const updateContact = useCallback(
    async (id: string, fields: Partial<ContactFields>) => {
      try {
        await invoke<Contact>("update_contact", {
          id,
          name: fields.name ?? null,
          phone: fields.phone ?? null,
          organization: fields.organization ?? null,
        });
        await reloadAll();
      } catch (err) {
        console.error(err);
        alert(`Error updating contact: ${err}`);
      }
    },
    [reloadAll]
  );

  const shareContact = useCallback(
    async (contactId: string, recipientUserId: string) => {
      try {
        await invoke<Contact>("share_contact", { contactId, recipientUserId });
        await reloadAll();
      } catch (err) {
        console.error(err);
        alert(`Error sharing contact: ${err}`);
      }
    },
    [reloadAll]
  );

  const unshareContact = useCallback(
    async (contactId: string, recipientUserId: string) => {
      try {
        await invoke("unshare_contact", { contactId, recipientUserId });
        await reloadAll();
      } catch (err) {
        console.error(err);
        alert(`Error revoking contact share: ${err}`);
      }
    },
    [reloadAll]
  );

  return {
    contacts,
    loading,
    error,
    searchableContacts,
    searchableLoading,
    searchableError,
    reload,
    reloadSearchable,
    reloadAll,
    linkExisting,
    createAndLink,
    unlink,
    updateContact,
    shareContact,
    unshareContact,
  };
}
