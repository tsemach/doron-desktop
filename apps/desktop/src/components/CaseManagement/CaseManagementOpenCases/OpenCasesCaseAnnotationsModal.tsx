import { useState, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "../../../context/LanguageContext";
import ResizeGrabGrip from "@/components/ui/ResizeGrabGrip";
import type { CaseStatus, Tag } from "../CaseManagementTypes";
import { SPECIAL_STATUS_TAGS, applyCaseSpecialStatus, clearCaseSpecialStatus } from "@/lib/caseSpecialStatus";
import OpenCasesCaseStatusConfirmModal from "./OpenCasesCaseStatusConfirmModal";
import OpenCasesCaseAnnotationsTagsEditor from "./OpenCasesCaseAnnotationsTagsEditor";
import OpenCasesCaseAnnotationsFollowupDate from "./OpenCasesCaseAnnotationsFollowupDate";
import OpenCasesCaseAnnotationsFooter from "./OpenCasesCaseAnnotationsFooter";

// UI copy for special-status tags a user can type directly into the tag
// input (i.e. the `tagType: "user"` entries in SPECIAL_STATUS_TAGS — system
// tags like "closed" are managed elsewhere, e.g. the "Close Case" kebab
// action, and are never user-typable here). Adding another user-triggerable
// special tag only needs one entry here, no new confirm-flow code.
const SPECIAL_TAG_CONFIRM_COPY: Record<string, {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  notePlaceholder: string;
  icon: ReactNode;
  iconClassName: string;
}> = {
  waiting: {
    title: "Move to Waiting",
    message: (
      <>Move this case into <span className="font-semibold text-foreground/90">waiting</span> status?</>
    ),
    confirmLabel: "Move to Waiting",
    notePlaceholder: "Reason for waiting, what it's waiting on, etc...",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    iconClassName: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
  },
};

interface OpenCasesCaseAnnotationsModalProps {
  caseId: string;
  caseSubject: string;
  initialNotes?: string;
  initialTags: Tag[];
  onSave: (notes: string) => void;
  onTagsChange: (tags: Tag[]) => void;
  onStatusChange?: (status: CaseStatus) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export default function OpenCasesCaseAnnotationsModal({
  caseId,
  caseSubject,
  initialNotes = "",
  initialTags,
  onSave,
  onTagsChange,
  onStatusChange,
  onCancel,
  onDelete,
}: OpenCasesCaseAnnotationsModalProps) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSpecialTag, setPendingSpecialTag] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    loadSuggestedTags();
  }, []);

  async function loadSuggestedTags() {
    try {
      const allTags = await invoke<string[]>("list_all_tag_names", { tagType: "user" });
      setSuggestedTags(allTags);
    } catch (e) {
      console.error("Failed to load suggested tags:", e);
    }
  }

  function applyTags(next: Tag[]) {
    setTags(next);
    onTagsChange(next);
  }

  async function handleAddTag(name: string, value?: string) {
    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName || tags.some((tg) => tg.name === trimmedName)) return;

    // User-triggerable special-status tags (e.g. "waiting") don't get added
    // directly — they drive a case status change, so confirm first via the
    // shared modal. System-managed ones (e.g. "closed") have no entry here
    // and are never typable — they're only ever set via their own flow
    // (e.g. the "Close Case" kebab action).
    if (trimmedName in SPECIAL_TAG_CONFIRM_COPY) {
      setPendingSpecialTag(trimmedName);
      return;
    }
    if (trimmedName in SPECIAL_STATUS_TAGS) {
      alert(`"${trimmedName}" is a system-managed status and can't be added as a tag directly.`);
      return;
    }

    try {
      const tag = await invoke<Tag>("add_tag", {
        scopeType: "case",
        scopeValue: caseId,
        name: trimmedName,
        value: value?.trim() || null,
        tagType: "user",
      });
      applyTags([...tags, tag]);
    } catch (err) {
      console.error(err);
      alert(`Failed to add tag: ${err}`);
    }
  }

  async function handleConfirmSpecialTag(confirmedNotes: string) {
    if (!pendingSpecialTag) return;
    try {
      const result = await applyCaseSpecialStatus(caseId, pendingSpecialTag, tags, confirmedNotes);
      setPendingSpecialTag(null);
      setTags(result.tags);
      onTagsChange(result.tags);
      onStatusChange?.(result.status);
      setNotes(confirmedNotes);
      onSave(confirmedNotes);
    } catch (err) {
      console.error(err);
      alert(`Failed to update case status: ${err}`);
    }
  }

  async function handleRemoveTag(tag: Tag) {
    try {
      // Removing a special-status tag (e.g. "waiting") also returns the case
      // to "open" — same reversal the "Reopen Case" kebab action performs.
      if (tag.name in SPECIAL_STATUS_TAGS) {
        const result = await clearCaseSpecialStatus(caseId, tags);
        applyTags(result.tags);
        onStatusChange?.(result.status);
        return;
      }

      await invoke("remove_tag", { scopeType: "case", scopeValue: caseId, name: tag.name });
      applyTags(tags.filter((tg) => tg.name !== tag.name));
    } catch (err) {
      console.error(err);
      alert(`Failed to remove tag: ${err}`);
    }
  }

  async function handleUpdateFollowupDate(newDate: string) {
    try {
      const tag = await invoke<Tag>("update_tag", {
        scopeType: "case",
        scopeValue: caseId,
        name: "followup",
        value: newDate || null,
        tagType: "user",
      });
      applyTags(tags.map((tg) => (tg.name === "followup" ? tag : tg)));
    } catch (err) {
      console.error(err);
      alert(`Failed to update follow-up date: ${err}`);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await invoke("set_case_annotations", {
        caseId: Number(caseId),
        notes: notes ? notes.trim() : null,
      });
      onSave(notes ? notes.trim() : "");
    } catch (err) {
      console.error(err);
      alert(`Failed to save case annotations: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete all notes and tags for this case?")) return;
    setIsSaving(true);
    try {
      await invoke("delete_case_annotations", { caseId: Number(caseId) });
      const userTagsToRemove = tags.filter((tg) => tg.type === "user");
      const clearedSpecialTag = userTagsToRemove.some((tg) => tg.name in SPECIAL_STATUS_TAGS);
      for (const tag of userTagsToRemove) {
        await invoke("remove_tag", { scopeType: "case", scopeValue: caseId, name: tag.name });
      }
      if (clearedSpecialTag) {
        await invoke("update_case_status", { id: Number(caseId), status: "open" });
        onStatusChange?.("open");
      }
      applyTags(tags.filter((tg) => tg.type === "system"));
      onDelete();
    } catch (err) {
      console.error(err);
      alert(`Failed to delete case annotations: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const userTags = tags.filter((tg) => tg.type === "user");
  const systemTags = tags.filter((tg) => tg.type === "system");
  const followupTag = userTags.find((tg) => tg.name === "followup");

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
        {/* Resizable Modal Container */}
        <div
          className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 resize overflow-hidden relative"
          style={{
            width: "1000px",
            height: "700px",
            minWidth: "500px",
            minHeight: "400px",
            maxWidth: "95vw",
            maxHeight: "95vh"
          }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
            <h3 className="text-base font-bold text-foreground truncate" title={caseSubject}>
              {t("case_annotations")}
            </h3>
            <p className="text-xs text-muted-foreground truncate mt-0.5" title={caseSubject}>
              {caseSubject}
            </p>
          </div>

          {/* Form and content */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 p-6 space-y-4">
            {/* Scrollable Form Body */}
            <div className="flex-grow flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
              <OpenCasesCaseAnnotationsTagsEditor
                userTags={userTags}
                systemTags={systemTags}
                suggestedTags={suggestedTags}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
              />

              {followupTag && (
                <OpenCasesCaseAnnotationsFollowupDate
                  value={followupTag.value}
                  onChange={handleUpdateFollowupDate}
                />
              )}

              {/* Notes section */}
              <div className="flex-grow flex flex-col min-h-[120px] space-y-2">
                <label className="text-xs font-semibold text-foreground shrink-0">Notes</label>
                <textarea
                  placeholder="Add your notes, key details, or internal descriptions about this case..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full flex-grow rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/80 leading-relaxed resize-none min-h-[80px]"
                />
              </div>
            </div>

            <OpenCasesCaseAnnotationsFooter
              showClearAll={!!(initialNotes || userTags.length > 0)}
              isSaving={isSaving}
              onClearAll={handleClearAll}
              onCancel={onCancel}
            />
          </form>

          <ResizeGrabGrip />
        </div>
      </div>

      {pendingSpecialTag && (
        <OpenCasesCaseStatusConfirmModal
          tags={tags}
          title={SPECIAL_TAG_CONFIRM_COPY[pendingSpecialTag].title}
          message={SPECIAL_TAG_CONFIRM_COPY[pendingSpecialTag].message}
          confirmLabel={SPECIAL_TAG_CONFIRM_COPY[pendingSpecialTag].confirmLabel}
          notePlaceholder={SPECIAL_TAG_CONFIRM_COPY[pendingSpecialTag].notePlaceholder}
          icon={SPECIAL_TAG_CONFIRM_COPY[pendingSpecialTag].icon}
          iconClassName={SPECIAL_TAG_CONFIRM_COPY[pendingSpecialTag].iconClassName}
          initialNotes={notes}
          onConfirm={handleConfirmSpecialTag}
          onCancel={() => setPendingSpecialTag(null)}
        />
      )}
    </>
  );
}
