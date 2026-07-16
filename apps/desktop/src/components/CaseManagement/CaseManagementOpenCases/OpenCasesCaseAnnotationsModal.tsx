import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/button";
import TagChip from "../../ui/TagChip";
import { useLanguage } from "../../../context/LanguageContext";
import type { Tag } from "../CaseManagementTypes";

interface OpenCasesCaseAnnotationsModalProps {
  caseId: string;
  caseSubject: string;
  initialNotes?: string;
  initialTags: Tag[];
  onSave: (notes: string) => void;
  onTagsChange: (tags: Tag[]) => void;
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
  onCancel,
  onDelete,
}: OpenCasesCaseAnnotationsModalProps) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [newTagName, setNewTagName] = useState("");
  const [newTagValue, setNewTagValue] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
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
    try {
      const tag = await invoke<Tag>("add_tag", {
        scopeType: "case",
        scopeValue: caseId,
        name: trimmedName,
        value: value?.trim() || null,
        tagType: "user",
      });
      applyTags([...tags, tag]);
      setNewTagName("");
      setNewTagValue("");
    } catch (err) {
      console.error(err);
      alert(`Failed to add tag: ${err}`);
    }
  }

  async function handleRemoveTag(tag: Tag) {
    try {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag(newTagName, newTagValue);
    }
  };

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
      for (const tag of userTagsToRemove) {
        await invoke("remove_tag", { scopeType: "case", scopeValue: caseId, name: tag.name });
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
  const isTypingFollowup = newTagName.trim().toLowerCase() === "followup";

  // Filter suggested tags to exclude currently added ones, and ensure "followup" is always offered if not already added.
  const filteredSuggestions = [...new Set(["followup", ...suggestedTags])].filter(
    (name) => !userTags.some((tg) => tg.name === name)
  );

  return (
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
            {/* Tags section */}
            <div className="space-y-2 shrink-0">
              <label className="text-xs font-semibold text-foreground flex justify-between">
                <span>Tags</span>
                <span className="text-[10px] text-muted-foreground">Press Enter or comma to add</span>
              </label>

              {/* Render current tags (system tags shown read-only, user tags removable) */}
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-input rounded-lg bg-background/50 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
                {systemTags.map((tag) => (
                  <TagChip key={tag.name} tag={tag} />
                ))}
                {userTags.map((tag) => (
                  <TagChip key={tag.name} tag={tag} onRemove={handleRemoveTag} />
                ))}
                <input
                  type="text"
                  placeholder={tags.length === 0 ? "Add tags (e.g. urgent, signed)..." : ""}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent text-xs text-foreground focus:outline-none border-none p-0.5 min-w-[120px]"
                />
              </div>

              {/* Optional value for the tag currently being typed */}
              {newTagName.trim() && (
                <div className="flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
                  <input
                    type={isTypingFollowup ? "date" : "text"}
                    placeholder={isTypingFollowup ? undefined : "Optional value..."}
                    value={newTagValue}
                    onChange={(e) => setNewTagValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAddTag(newTagName, newTagValue)}
                  >
                    Add
                  </Button>
                </div>
              )}

              {/* Suggested Tags */}
              {filteredSuggestions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Suggested Tags:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {filteredSuggestions.slice(0, 10).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleAddTag(name)}
                        className="px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground transition-all duration-150"
                      >
                        +{name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Follow-up Date (editable once the "followup" tag exists) */}
            {followupTag && (
              <div className="space-y-2 shrink-0 animate-in slide-in-from-top-2 duration-200 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <span>📅 Follow-up Date</span>
                  <span className="text-[10px] text-muted-foreground font-normal">(Case status will show as due/overdue on this date)</span>
                </label>
                <input
                  type="date"
                  value={followupTag.value || ""}
                  onChange={(e) => {
                    handleUpdateFollowupDate(e.target.value);
                    if (e.target.value && e.target.value.length === 10) {
                      e.target.blur();
                    }
                  }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground cursor-pointer"
                />
              </div>
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

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-border pt-4 mt-auto shrink-0 select-none">
            <div>
              {(initialNotes || userTags.length > 0) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={isSaving}
                >
                  Clear All
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Annotations"}
              </Button>
            </div>
          </div>
        </form>

        {/* Visual Resize Grab Grip */}
        <div className="absolute bottom-1 right-1 pointer-events-none text-muted-foreground/40">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="9" x2="9" y2="1" />
            <line x1="4" y1="9" x2="9" y2="4" />
            <line x1="7" y1="9" x2="9" y2="7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
