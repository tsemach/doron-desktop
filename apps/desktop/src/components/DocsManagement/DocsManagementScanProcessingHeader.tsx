interface DocsManagementScanProcessingHeaderProps {
  isFolder: boolean;
  selectedPath: string;
}

export default function DocsManagementScanProcessingHeader({
  isFolder,
  selectedPath,
}: DocsManagementScanProcessingHeaderProps) {
  return (
    <div className="space-y-1 min-w-0 justify-self-start">
      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
        {isFolder ? "Directory Sync" : "Single File Scan"}
      </span>
      <h3 className="text-sm font-bold truncate text-foreground font-mono">
        {selectedPath}
      </h3>
    </div>
  );
}
