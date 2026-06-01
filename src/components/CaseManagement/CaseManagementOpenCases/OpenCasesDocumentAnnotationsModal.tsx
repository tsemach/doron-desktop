import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/button";

interface OpenCasesDocumentAnnotationsModalProps {
  fileName: string;
  filePath: string;
  initialNotes?: string;
  initialTags?: string[];
  onSave: (notes: string, tags: string[]) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export default function OpenCasesDocumentAnnotationsModal({
  fileName,
  filePath,
  initialNotes = "",
  initialTags = [],
  onSave,
  onCancel,
  onDelete,
}: OpenCasesDocumentAnnotationsModalProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [newTag, setNewTag] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSuggestedTags();
  }, []);

  async function loadSuggestedTags() {
    try {
      const allTags = await invoke<string[]>("list_all_annotation_tags");
      setSuggestedTags(allTags);
    } catch (e) {
      console.error("Failed to load suggested tags:", e);
    }
  }

  function handleAddTag() {
    const trimmed = newTag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTag("");
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  function handleAddSuggestedTag(tag: string) {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await invoke("set_document_annotations", {
        filePath,
        notes: notes.trim() || null,
        tags,
      });
      onSave(notes.trim(), tags);
    } catch (err) {
      console.error(err);
      alert(`Failed to save annotations: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to delete all notes and tags for this document?")) return;
    setIsSaving(true);
    try {
      await invoke("delete_document_annotations", { filePath });
      onDelete();
    } catch (err) {
      console.error(err);
      alert(`Failed to delete annotations: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter suggested tags to exclude currently added ones
  const filteredSuggestions = suggestedTags.filter((t) => !tags.includes(t));

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
        {/* Header (fixed height, won't shrink) */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <h3 className="text-base font-bold text-foreground truncate" title={fileName}>
            Annotate Document
          </h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5" title={filePath}>
            {fileName}
          </p>
        </div>

        {/* Form and content (flex-1 min-h-0 to contain inner scrollbars) */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 p-6 space-y-4">
          {/* Scrollable Form Body */}
          <div className="flex-grow flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
            {/* Tags section */}
            <div className="space-y-2 shrink-0">
              <label className="text-xs font-semibold text-foreground flex justify-between">
                <span>Tags</span>
                <span className="text-[10px] text-muted-foreground">Press Enter or comma to add</span>
              </label>

              {/* Render current tags */}
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-input rounded-lg bg-background/50 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold select-none border border-primary/20"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-primary/20 text-primary/75 hover:text-primary rounded-full p-0.5 leading-none transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={tags.length === 0 ? "Add tags (e.g. signed, contract)..." : ""}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent text-xs text-foreground focus:outline-none border-none p-0.5 min-w-[120px]"
                />
              </div>

              {/* Suggested Tags */}
              {filteredSuggestions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Suggested Tags:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {filteredSuggestions.slice(0, 10).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleAddSuggestedTag(tag)}
                        className="px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground transition-all duration-150"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notes section (flex-grow to stretch and fill height) */}
            <div className="flex-grow flex flex-col min-h-[120px] space-y-2">
              <label className="text-xs font-semibold text-foreground shrink-0">Notes</label>
              <textarea
                placeholder="Add your notes, key details, or internal descriptions about this document..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full flex-grow rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/80 leading-relaxed resize-none min-h-[80px]"
              />
            </div>
          </div>

          {/* Footer Actions (fixed height, mt-auto to sit at the bottom) */}
          <div className="flex items-center justify-between border-t border-border pt-4 mt-auto shrink-0 select-none">
            <div>
              {(initialNotes || initialTags.length > 0) && (
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

        {/* Visual Resize Grab Grip indicator in bottom-right corner (pointer-events-none to pass click through to browser handle) */}
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
