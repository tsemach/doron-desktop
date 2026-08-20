import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { ContactFields } from "@/lib/contact/types";

const inputClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all";

interface ContactFormDialogProps {
  mode: "new" | "edit";
  initialValues: ContactFields;
  onSubmit: (fields: ContactFields) => Promise<void>;
  onCancel: () => void;
}

// Same modal chrome as ContactSharePickerDialog.tsx -- shared by both the
// "New contact" and "Edit contact" actions in CaseContactsPanel.tsx (one
// component, one window; only the title/submit label and whether email is
// editable change with `mode` -- email is immutable once a contact exists,
// per docs/contact/design.md §6).
export default function ContactFormDialog({ mode, initialValues, onSubmit, onCancel }: ContactFormDialogProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ContactFields>(initialValues);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      // Always trimmed strings, never coerced to undefined here -- "new" (createAndLink)
      // and "edit" (updateContact) have different empty-field semantics (omit vs. explicit
      // clear), so that decision belongs to the caller's onSubmit, not this shared dialog.
      await onSubmit({
        name: draft.name?.trim() ?? "",
        email: draft.email.trim(),
        phone: draft.phone?.trim() ?? "",
        organization: draft.organization?.trim() ?? "",
      });
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to save contact");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">
            {mode === "new" ? t("contact_new_contact") : t("contact_edit_contact")}
          </h3>
        </div>

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground" htmlFor="contact-form-name">
              {t("contact_name_placeholder")}
            </label>
            <input
              id="contact-form-name"
              type="text"
              value={draft.name || ""}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className={inputClass}
              disabled={sending}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground" htmlFor="contact-form-email">
              {t("contact_email_placeholder")}
            </label>
            <input
              id="contact-form-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
              className={`${inputClass} ${mode === "edit" ? "opacity-60 cursor-not-allowed" : ""}`}
              required
              disabled={sending || mode === "edit"}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground" htmlFor="contact-form-phone">
              {t("contact_phone_placeholder")}
            </label>
            <input
              id="contact-form-phone"
              type="text"
              value={draft.phone || ""}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
              className={inputClass}
              disabled={sending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground" htmlFor="contact-form-organization">
              {t("contact_organization_placeholder")}
            </label>
            <input
              id="contact-form-organization"
              type="text"
              value={draft.organization || ""}
              onChange={(e) => setDraft((d) => ({ ...d, organization: e.target.value }))}
              className={inputClass}
              disabled={sending}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={sending}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="sm" className="min-w-[96px]" disabled={sending}>
            {mode === "new" ? t("contact_add") : t("contact_save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
