import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/button";

interface CaseFieldsModalProps {
  caseId: number;
  caseName: string;
  onClose: () => void;
}

export default function OpenCasesFieldsModal({
  caseId,
  caseName,
  onClose,
}: CaseFieldsModalProps) {
  const [fields, setFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFields();
  }, [caseId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function loadFields() {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<Record<string, string>>("get_case_fields", { caseId });
      if (res) {
        const sortedFields = Object.keys(res).sort();
        setFields(sortedFields);
      }
    } catch (e) {
      console.error("Failed to load case fields:", e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative"
        style={{
          width: "550px",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Case Fields Index
            </h3>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              Current fields populated for: <span className="font-semibold text-foreground/80">{caseName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-1 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="animate-spin text-xl font-bold mb-2">⟳</div>
              <p className="text-xs">Fetching case fields...</p>
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-xs text-destructive">
              <span className="font-bold">Error loading fields: </span>
              {error}
            </div>
          ) : fields.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground p-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto text-muted-foreground/40 mb-3"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M7 8h10" />
                <path d="M7 12h10" />
                <path d="M7 16h10" />
              </svg>
              <p className="text-xs font-semibold">No Fields Defined</p>
              <p className="text-[10px] text-muted-foreground/80 mt-1.5 max-w-[340px] mx-auto">
                No fields have been saved for this case yet. Fields are populated automatically when you create a case or generate documents from templates.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Fields in this Case ({fields.length}):
              </div>
              <div className="flex flex-wrap gap-2 max-h-[40vh] overflow-y-auto pr-1">
                {fields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex items-center px-2.5 py-1 rounded bg-secondary text-secondary-foreground text-xs font-medium border border-border select-all"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/30 flex justify-end shrink-0">
          <Button onClick={onClose} size="sm" className="text-xs px-4">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
