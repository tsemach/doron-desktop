import { ProgressItem } from "./DocsManagementScan";

interface DocsManagementScanProcessingProgressProps {
  currentItem: ProgressItem;
}

export default function DocsManagementScanProcessingCurrent({
  currentItem,
}: DocsManagementScanProcessingProgressProps) {
  return (
    <div className="flex items-center gap-3 mx-6 mt-4 p-3 rounded-lg border border-blue-100 bg-blue-50/40 font-mono text-xs text-blue-900">
      <span className="inline-block animate-spin text-blue-500 w-4 shrink-0 text-center text-sm font-bold">
        ⟳
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-bold truncate">{currentItem.file_name}</p>
        <p className="text-blue-700 text-[10px] mt-0.5">{currentItem.message}</p>
      </div>
    </div>
  );
}
