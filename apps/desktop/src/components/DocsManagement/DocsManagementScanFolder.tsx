interface DocsManagementScanFolderProps {
  isDisabled: boolean;
  isFolderActive: boolean;
  onSelectFolder: () => void;
}

export default function DocsManagementScanFolder({
  isDisabled,
  isFolderActive,
  onSelectFolder,
}: DocsManagementScanFolderProps) {
  return (
    <div
      onClick={(isDisabled && isFolderActive) ? undefined : onSelectFolder}
      className={`group relative rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 flex flex-col justify-between items-start ${
        (isDisabled && isFolderActive)
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
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold group-hover:text-primary transition-colors">
            Index Entire Folder
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Recursively scans a directory for PDF, DOCX, TXT, and Excel sheets. Perfect for importing legal archives.
          </p>
        </div>
      </div>
      <div className="mt-6 flex items-center text-xs font-semibold text-primary gap-1 group-hover:underline">
        Choose Directory
        <span>→</span>
      </div>
    </div>
  );
}
