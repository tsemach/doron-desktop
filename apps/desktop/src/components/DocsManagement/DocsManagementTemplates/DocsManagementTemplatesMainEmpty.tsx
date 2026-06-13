import { Button } from "../../ui/button";

interface DocsManagementTemplatesMainEmptyProps {
  onAddTemplate: () => void;
  isProcessing: boolean;
}

export default function DocsManagementTemplatesMainEmpty({
  onAddTemplate,
  isProcessing,
}: DocsManagementTemplatesMainEmptyProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 bg-background">
      <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
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
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
          <line x1="9" y1="11" x2="15" y2="11" />
        </svg>
      </div>
      <div className="space-y-1.5 max-w-md">
        <h3 className="text-sm font-bold text-foreground">No Document Template Selected</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose a template from the list on the left to fill placeholders and auto-generate new
          filled copies, or upload a new template to get started.
        </p>
      </div>
      <Button size="sm" onClick={onAddTemplate} disabled={isProcessing}>
        Upload New Template
      </Button>
    </div>
  );
}
