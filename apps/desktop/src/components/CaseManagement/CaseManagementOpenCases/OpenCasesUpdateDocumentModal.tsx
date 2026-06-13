import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

import { CaseFile } from "../CaseManagementTypes";

interface OpenCasesUpdateDocumentModalProps {
  caseId: number;
  caseFolder: string;
  attachment: { name: string; staged_path: string; size_kb: number };
  existingDocuments: CaseFile[];
  onSave: () => void;
  onCancel: () => void;
}

export default function OpenCasesUpdateDocumentModal({
  caseId,
  caseFolder,
  attachment,
  existingDocuments,
  onSave,
  onCancel,
}: OpenCasesUpdateDocumentModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if file exists to display overwrite warning
  const fileExists = existingDocuments.some(
    (doc) => doc.name.toLowerCase() === attachment.name.toLowerCase()
  );

  // Annotations states
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [caseId, attachment.name]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Load annotations if document already exists in existingDocuments list
      const existingDoc = existingDocuments.find(
        (doc) => doc.name.toLowerCase() === attachment.name.toLowerCase()
      );
      if (existingDoc) {
        setNotes(existingDoc.notes || "");
        setTags(existingDoc.tags || []);
      } else {
        setNotes("");
        setTags([]);
      }

      // 2. Load all suggested tags
      try {
        const allTags = await invoke<string[]>("list_all_annotation_tags");
        setSuggestedTags(allTags);
      } catch (e) {
        console.error("Failed to load suggested tags:", e);
      }

    } catch (err) {
      console.error("Failed to load modal data:", err);
      setError("Failed to load data for updating document.");
    } finally {
      setLoading(false);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag();
    }
  };

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Copy the file into the case folder
      const targetFilePath = await invoke<string>("add_file_to_case", {
        caseFolder,
        sourcePath: attachment.staged_path,
      });

      const normalizedFilePath = targetFilePath.replace(/\\/g, "/");

      // 2. Save annotations (notes and tags)
      await invoke("set_document_annotations", {
        filePath: normalizedFilePath,
        notes: notes.trim() || null,
        tags,
      });

      // 3. Remove the file from email attachments
      await invoke("remove_attachment", {
        caseId,
        stagedPath: attachment.staged_path,
        importedPath: normalizedFilePath,
      });

      onSave();
    } catch (err) {
      console.error("Failed to copy/update document:", err);
      setError("Failed to complete update operation: " + err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredSuggestions = suggestedTags.filter((t) => !tags.includes(t));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-in fade-in duration-200">
      <div
        className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 resize overflow-hidden relative"
        style={{
          width: "1200px",
          height: "800px",
          minWidth: "700px",
          minHeight: "600px",
          maxWidth: "95vw",
          maxHeight: "95vh",
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <h3 className="text-base font-bold text-foreground">
            {fileExists ? "Update Case Document" : "Add Attachment to Case"}
          </h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5" title={attachment.name}>
            Source: {attachment.name}
          </p>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col min-h-0 p-6 space-y-4">
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2.5 text-xs text-destructive shrink-0">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex-grow flex flex-col items-center justify-center py-8 text-muted-foreground">
              <div className="animate-spin text-xl font-bold mb-1">⟳</div>
              <p className="text-xs">Loading document data...</p>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col flex-1 min-h-0">
              {/* Overwrite Warning Callout */}
              {fileExists && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2.5 shrink-0 animate-fade-in">
                  <span className="text-sm leading-none mt-0.5">⚠️</span>
                  <div className="space-y-0.5">
                    <p className="font-bold">File Overwrite Warning</p>
                    <p className="text-muted-foreground/95">
                      A document with the name <strong>{attachment.name}</strong> already exists in this case folder.
                      Proceeding will replace it with this attachment version.
                    </p>
                  </div>
                </div>
              )}

              {/* Annotations Section */}
              <div className="flex-1 flex flex-col min-h-0 space-y-3 border border-border/60 rounded-lg p-4 bg-muted/5">
                <div className="pb-1 border-b border-border/60 shrink-0">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Document Annotations
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Add notes or tags to help identify this document.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 flex flex-col min-h-0">
                  {/* Tags */}
                  <div className="space-y-1.5 shrink-0">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex justify-between">
                      <span>Tags</span>
                      <span className="text-[9px] text-muted-foreground/85 normal-case">Press Enter to add</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-lg bg-background/50 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold select-none border border-primary/20"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:bg-primary/20 text-primary/75 hover:text-primary rounded-full p-0.5 leading-none transition-colors"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder={tags.length === 0 ? "Add tags (e.g. signed, client-edits)..." : ""}
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent text-xs text-foreground focus:outline-none border-none p-0.5 min-w-[120px]"
                      />
                    </div>

                    {/* Suggestions */}
                    {filteredSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {filteredSuggestions.slice(0, 5).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setTags([...tags, tag])}
                            className="px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-[9px] text-muted-foreground hover:text-foreground transition-all"
                          >
                            +{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-1 flex-1 flex flex-col min-h-0">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Notes</label>
                    <textarea
                      placeholder="e.g. Signed contract received from client via email."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full flex-1 min-h-[100px] rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/80 leading-relaxed resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border mt-auto flex justify-end gap-2 shrink-0 select-none">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={loading || isSubmitting}
            className={fileExists ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
          >
            {isSubmitting ? "Processing..." : fileExists ? "Update & Overwrite" : "Copy & Add to Case"}
          </Button>
        </div>
      </div>
    </div>
  );
}
