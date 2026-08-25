import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { GoogleContact } from "@/lib/contact/types";
import { AttendeeFormValue } from "@/hooks/useMeetingList";

// Mirrors contact::google_people::INSUFFICIENT_SCOPE_ERROR exactly, same
// sentinel GoogleContactsImportDialog.tsx already checks for -- a token
// connected before contacts.readonly was added to the OAuth scope.
const INSUFFICIENT_SCOPE_ERROR = "google_people_insufficient_scope";

interface AttendeePickerDialogProps {
  // Emails already added to the meeting, so already-picked contacts don't
  // show up as selectable again.
  existingEmails: Set<string>;
  onAdd: (attendees: AttendeeFormValue[]) => void;
  onCancel: () => void;
}

// Adapted from GoogleContactsImportDialog.tsx's multi-select-checkbox
// pattern (same search filter + Set<string> selection + "N selected"
// counter) -- Google Calendar is already required to be connected to reach
// MeetingForm at all (design.md §1 R3), so this skips that dialog's
// connect-prompt branch and goes straight to loading contacts
// (docs/calendar/adding-people-to-meeting.md §7).
export default function AttendeePickerDialog({ existingEmails, onAdd, onCancel }: AttendeePickerDialogProps) {
  const { t } = useLanguage();

  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsRescope, setNeedsRescope] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadContacts = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setNeedsRescope(false);
    invoke<GoogleContact[]>("list_google_contacts")
      .then(setContacts)
      .catch((err) => {
        console.error("Failed to load Google Contacts:", err);
        if (String(err) === INSUFFICIENT_SCOPE_ERROR) {
          setNeedsRescope(true);
        } else {
          setLoadError(String(err));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  async function handleReconnect() {
    setReconnecting(true);
    setLoadError(null);
    try {
      await invoke("connect_google_calendar");
      loadContacts();
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setReconnecting(false);
    }
  }

  const selectable = useMemo(() => contacts.filter((c) => c.email && !existingEmails.has(c.email.toLowerCase())), [contacts, existingEmails]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }, [selectable, query]);

  function toggle(resourceName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(resourceName)) {
        next.delete(resourceName);
      } else {
        next.add(resourceName);
      }
      return next;
    });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !reconnecting) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [reconnecting, onCancel]);

  function handleAddSelected() {
    const toAdd: AttendeeFormValue[] = selectable
      .filter((c) => selected.has(c.resource_name) && c.email)
      .map((c) => ({ email: c.email as string, displayName: c.name || undefined }));
    onAdd(toAdd);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[32rem] h-[28rem] min-w-[22rem] min-h-[18rem] max-w-[95vw] max-h-[90vh] resize overflow-auto bg-card border border-border rounded-lg shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
        <div className="space-y-1.5 shrink-0">
          <h3 className="text-lg font-bold text-foreground">{t("calendar_attendees_picker_title")}</h3>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {loadError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shrink-0">{loadError}</div>}

          {needsRescope ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-normal">{t("google_contacts_rescope_description")}</p>
              <Button onClick={handleReconnect} disabled={reconnecting}>
                {reconnecting ? t("calendar_connecting") : t("google_contacts_reconnect_button")}
              </Button>
            </div>
          ) : loading ? (
            <p className="text-xs text-muted-foreground">{t("google_contacts_loading")}</p>
          ) : selectable.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("google_contacts_empty")}</p>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("contact_search_placeholder")}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all shrink-0"
                autoFocus
              />
              <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border rounded-md border border-border">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">{t("google_contacts_no_matches")}</p>
                ) : (
                  filtered.map((c) => (
                    <label key={c.resource_name} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.has(c.resource_name)}
                        onChange={() => toggle(c.resource_name)}
                        className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{c.name || c.email}</p>
                        {c.name && <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>}
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selected.size > 0 && (
                <p className="text-[11px] text-muted-foreground shrink-0">{t("google_contacts_selected_count").replace("{count}", String(selected.size))}</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border pt-4 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          {!needsRescope && !loading && selectable.length > 0 && (
            <Button type="button" size="sm" onClick={handleAddSelected} disabled={selected.size === 0}>
              {t("google_contacts_import_selected")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
