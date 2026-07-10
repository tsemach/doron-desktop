interface DocsManagementScanProcessingProgressProps {
  progressPercent: number;
}

export default function DocsManagementScanProcessingProgress({
  progressPercent,
}: DocsManagementScanProcessingProgressProps) {
  return (
    <div className="px-6 pt-4 space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-muted-foreground">Overall Progress</span>
        <span className="font-mono text-primary">{progressPercent}%</span>
      </div>
      <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden border border-border/40">
        <div
          className="bg-primary h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
