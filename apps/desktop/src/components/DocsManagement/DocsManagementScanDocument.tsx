interface DocsManagementScanDocumentProps {
  isDisabled: boolean;
  isFolderActive: boolean;
  onSelectFile: () => void;
}

export default function DocsManagementScanDocument({
  isDisabled,
  isFolderActive,
  onSelectFile,
}: DocsManagementScanDocumentProps) {
  return (
    <div
      onClick={(isDisabled && !isFolderActive) ? undefined : onSelectFile}
      className={`group relative rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 flex flex-col justify-between items-start ${
        (isDisabled && !isFolderActive)
          ? "opacity-60 cursor-not-allowed pointer-events-none bg-muted/20"
          : "hover:shadow-md cursor-pointer hover:-translate-y-0.5"
      }`}
    >
      <div className="space-y-4">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold group-hover:text-primary transition-colors">
            Index Single Document
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select a single document to index. Ideal for quick updates or testing formatting.
          </p>
        </div>
      </div>
      <div className="mt-6 flex items-center text-xs font-semibold text-primary gap-1 group-hover:underline">
        Choose File
        <span>→</span>
      </div>
    </div>
  );
}
