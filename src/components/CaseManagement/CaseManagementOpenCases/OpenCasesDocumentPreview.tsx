import { Button } from "@/components/ui/button";
import { useLanguage } from "../../../context/LanguageContext";

import { CaseFile } from "../CaseManagementTypes";

interface OpenCasesDocumentPreviewProps {
  selectedDocument: CaseFile | null;
  previewLoading: boolean;
  previewError: string | null;
  previewHtml: string | null;
  previewText: string | null;
  onOpenFile: (filePath: string) => void;
}

export default function OpenCasesDocumentPreview({
  selectedDocument,
  previewLoading,
  previewError,
  previewHtml,
  previewText,
  onOpenFile,
}: OpenCasesDocumentPreviewProps) {
  const { t } = useLanguage();

  if (!selectedDocument) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground p-8 text-center animate-fade-in">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground/30 mb-3"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p className="text-sm font-semibold">{t("no_document_selected")}</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-[280px]">
          {t("select_document_desc")}
        </p>
      </div>
    );
  }

  if (previewLoading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground py-12">
        <div className="animate-spin text-3xl font-bold mb-2">⟳</div>
        <p className="text-sm">{t("converting_preview")}</p>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-8 text-center text-muted-foreground animate-fade-in">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-amber-500 mb-3"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        <p className="text-sm font-semibold text-foreground">{t("preview_unavailable")}</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-[320px]">
          {previewError}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenFile(selectedDocument.path)}
          className="mt-4 gap-1.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
          {t("open_external_app")}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 w-full bg-card min-h-full shadow-xs animate-fade-in">
      {previewHtml && (
        <div
          className="docx-content-view prose dark:prose-invert max-w-none text-foreground/90 text-sm leading-relaxed"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}
      {previewText && (
        <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground/90 bg-muted/30 p-4 rounded-lg border border-border/80">
          {previewText}
        </pre>
      )}
    </div>
  );
}
