import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";

interface OpenCasesAddDocumentFileProps {
  caseFolder: string;
  onSave: () => void;
  onCancel: () => void;
}

export default function OpenCasesAddDocumentFile({
  caseFolder,
  onSave,
  onCancel,
}: OpenCasesAddDocumentFileProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Browse any document from local file system
  async function handleBrowseAnyDocument() {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        title: "Select Document to Add",
        filters: [
          {
            name: "All Documents",
            extensions: ["*"]
          }
        ]
      });

      if (selected && typeof selected === "string") {
        setSelectedFilePath(selected);
        const name = selected.split(/[\\/]/).pop() || selected;
        setSelectedFileName(name);
      }
    } catch (err) {
      console.error("Browse document error:", err);
      setError("Failed to open file picker.");
    }
  }

  // Add browsed document to case
  async function handleAddAnyDoc() {
    if (!selectedFilePath) {
      setError("Please select a document to add.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await invoke("add_file_to_case", {
        caseFolder,
        sourcePath: selectedFilePath,
      });

      onSave();
    } catch (err) {
      console.error(err);
      setError("Failed to add file: " + err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex-grow flex flex-col min-h-0">
      {/* Content Body */}
      <div className="flex-1 flex flex-col min-h-0 p-6 overflow-y-auto">
        {error && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2.5 text-xs text-destructive shrink-0">
            {error}
          </div>
        )}

        <div className="flex-grow flex flex-col justify-center items-center py-8 space-y-4">
          <div className="w-16 h-16 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground/50 bg-muted/10 shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
          </div>

          <div className="text-center max-w-sm space-y-1">
            <p className="text-sm font-semibold">Browse Local Document</p>
            <p className="text-xs text-muted-foreground/80">
              Select any Word, PDF, Excel, text document, or other file from your local system.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleBrowseAnyDocument}
            disabled={isSubmitting}
            className="px-6 py-2.5 h-auto text-xs font-semibold"
          >
            Choose File...
          </Button>

          {selectedFilePath && (
            <div className="w-full max-w-md p-3 border border-border/80 bg-muted/10 rounded-lg text-left space-y-1">
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Selected File:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilePath("");
                    setSelectedFileName("");
                  }}
                  className="text-muted-foreground hover:text-destructive p-0.5"
                  title="Clear selection"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-xs font-medium text-primary truncate" title={selectedFileName}>
                {selectedFileName}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono truncate" title={selectedFilePath}>
                {selectedFilePath}
              </div>
            </div>
          )}
        </div>
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
          onClick={handleAddAnyDoc}
          disabled={isSubmitting || !selectedFilePath}
        >
          {isSubmitting ? "Adding..." : "Copy & Add to Case"}
        </Button>
      </div>
    </div>
  );
}
