import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { Contact, GoogleContact } from "@/lib/contact/types";
import { GoogleCalendarStatus } from "@/lib/calendar/types";

interface GoogleContactsImportDialogProps {
  caseId: number;
  // Called once after a (partially or fully) successful import so the
  // caller can reload its contact list -- mirrors useContactList's own
  // reload/reloadAll shape rather than this dialog reaching into that hook
  // itself.
  onImported: () => void;
  onCancel: () => void;
}

// Same modal chrome as ContactSharePickerDialog.tsx (backdrop, card, escape
// to close) -- kept consistent with that dialog for this feature area.
export default function GoogleContactsImportDialog({ caseId, onImported, onCancel }: GoogleContactsImportDialogProps) {
  const { t } = useLanguage();

  const [status, setStatus] = useState<GoogleCalendarStatus | null | "loading">("loading");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    invoke<GoogleCalendarStatus | null>("get_google_calendar_status")
      .then(setStatus)
      .catch((err) => {
        console.error("Failed to load Google Calendar status:", err);
        setStatus(null);
      });
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status === "loading" || status === null) return;
    setLoadingContacts(true);
    setLoadError(null);
    invoke<GoogleContact[]>("list_google_contacts")
      .then(setGoogleContacts)
      .catch((err) => {
        console.error("Failed to load Google Contacts:", err);
        setLoadError(String(err));
      })
      .finally(() => setLoadingContacts(false));
  }, [status]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !importing && !connecting) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [importing, connecting, onCancel]);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      await invoke("connect_google_calendar");
      loadStatus();
    } catch (err) {
      setConnectError(String(err));
    } finally {
      setConnecting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return googleContacts;
    return googleContacts.filter((c) => (c.name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }, [googleContacts, query]);

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

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    const toImport = googleContacts.filter((c) => selected.has(c.resource_name) && c.email);

    let failed = 0;
    for (const contact of toImport) {
      try {
        const created = await invoke<Contact>("create_contact", {
          name: contact.name || null,
          email: contact.email,
          phone: contact.phone || null,
          organization: contact.organization || null,
          googleContactId: contact.resource_name,
        });
        await invoke("add_contact_to_case", { caseId, backendContactId: created.id, source: "google" });
      } catch (err) {
        console.error(err);
        failed += 1;
      }
    }

    setImporting(false);
    if (failed > 0) {
      setImportError(t("google_contacts_import_error"));
    }
    if (failed < toImport.length) {
      onImported();
    }
    if (failed === 0) {
      onCancel();
    }
  }

  const busy = connecting || importing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">{t("google_contacts_import_title")}</h3>
        </div>

        {status === "loading" ? (
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
        ) : status === null ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-normal">{t("google_contacts_not_connected_description")}</p>
            {connectError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{connectError}</div>}
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? t("calendar_connecting") : t("calendar_connect_button")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {importError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{importError}</div>}
            {loadError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{loadError}</div>}

            {loadingContacts ? (
              <p className="text-xs text-muted-foreground">{t("google_contacts_loading")}</p>
            ) : googleContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("google_contacts_empty")}</p>
            ) : (
              <>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("contact_search_placeholder")}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
                  autoFocus
                />
                <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">
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
                          {(c.phone || c.organization) && (
                            <p className="text-[11px] text-muted-foreground truncate">{[c.phone, c.organization].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {selected.size > 0 && (
                  <p className="text-[11px] text-muted-foreground">{t("google_contacts_selected_count").replace("{count}", String(selected.size))}</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </Button>
          {status && status !== "loading" && (
            <Button type="button" size="sm" className="min-w-[96px]" onClick={handleImport} disabled={busy || selected.size === 0}>
              {importing ? t("google_contacts_importing") : t("google_contacts_import_selected")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
