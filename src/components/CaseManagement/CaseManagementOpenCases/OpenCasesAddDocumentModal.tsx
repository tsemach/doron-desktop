import { useState } from "react";
import OpenCasesAddDocumentTemplate from "./OpenCasesAddDocumentTemplate";
import OpenCasesAddDocumentFile from "./OpenCasesAddDocumentFile";

interface OpenCasesAddDocumentModalProps {
  caseId: number;
  caseFolder: string;
  onSave: () => void;
  onCancel: () => void;
}

type TabType = "template" | "browse";

export default function OpenCasesAddDocumentModal({
  caseId,
  caseFolder,
  onSave,
  onCancel,
}: OpenCasesAddDocumentModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("template");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 resize overflow-hidden relative"
        style={{
          width: "680px",
          height: "540px",
          minWidth: "480px",
          minHeight: "400px",
          maxWidth: "95vw",
          maxHeight: "95vh",
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <h3 className="text-base font-bold text-foreground">Add Document to Case</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5" title={caseFolder}>
            Destination: {caseFolder}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-muted/15 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("template")}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition-all ${
              activeTab === "template"
                ? "border-primary text-primary bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            Use Document Template
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("browse")}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition-all ${
              activeTab === "browse"
                ? "border-primary text-primary bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            Browse Any File
          </button>
        </div>

        {activeTab === "template" ? (
          <OpenCasesAddDocumentTemplate
            caseId={caseId}
            caseFolder={caseFolder}
            onSave={onSave}
            onCancel={onCancel}
          />
        ) : (
          <OpenCasesAddDocumentFile
            caseFolder={caseFolder}
            onSave={onSave}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}
