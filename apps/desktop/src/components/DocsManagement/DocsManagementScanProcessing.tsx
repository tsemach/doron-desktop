import { useState } from "react";
import DocsManagementScanFooter from "./DocsManagementScanFooter";
import DocsManagementScanCancel from "./DocsManagementScanCancel";
import DocsManagementScanProcessingActions from "./DocsManagementScanProcessingActions";
import DocsManagementScanFileCount from "./DocsManagementScanFileCount";
import DocsManagementScanProcessingHeader from "./DocsManagementScanProcessingHeader";
import DocsManagementScanProcessingCurrent from "./DocsManagementScanProcessingCurrent";
import DocsManagementScanProcessingProgress from "./DocsManagementScanProcessingProgress";
import DocsManagementScanProcessingLog from "./DocsManagementScanProcessingLog";
import { ProgressItem, IndexSummary } from "./DocsManagementScan";



interface DocsManagementScanProcessingProps {
  isFolder: boolean;
  selectedPath: string;
  isProcessing: boolean;
  items: ProgressItem[];
  currentCount: number;
  totalCount: number;
  handleStopIndexing: () => void;
  onCancelIndexing: () => Promise<void> | void;
  summary: IndexSummary | null;
  startIndexing: (path: string, isFolder: boolean, isContinue?: boolean, startIndex?: number, reindex?: boolean) => void;
  progressPercent: number;
  currentItem: ProgressItem | undefined;
  error: string | null;
  resetState?: () => void;
}

export default function DocsManagementScanProcessing({
  isFolder,
  selectedPath,
  isProcessing,
  items,
  currentCount,
  totalCount,
  handleStopIndexing,
  onCancelIndexing,
  summary,
  startIndexing,
  progressPercent,
  currentItem,
  error,
  resetState,
}: DocsManagementScanProcessingProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 animate-fade-in">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 items-center px-6 py-4 border-b border-border/60 bg-muted/30 gap-3">
          {/* Column 1: Path */}
          <DocsManagementScanProcessingHeader
            isFolder={isFolder}
            selectedPath={selectedPath}
          />

          {/* Column 2: Files Count (Centered) */}
          <div className="flex justify-center justify-self-center">
            {(isProcessing || items.length > 0) && (
              <DocsManagementScanFileCount
                current={currentCount}
                total={totalCount}
              />
            )}
          </div>

          {/* Column 3: Actions (Right-aligned) */}
          <DocsManagementScanProcessingActions
            isProcessing={isProcessing}
            handleStopIndexing={handleStopIndexing}
            onShowCancelConfirm={() => setShowCancelConfirm(true)}
            summary={summary}
            selectedPath={selectedPath}
            isFolder={isFolder}
            startIndexing={startIndexing}
            items={items}
          />
        </div>

        {/* Progress bar container */}
        {(isProcessing || items.some((i) => i.message === "Indexing stopped by user")) && (
          <DocsManagementScanProcessingProgress progressPercent={progressPercent} />
        )}

        {/* Active item status detail */}
        {isProcessing && (
          <DocsManagementScanProcessingCurrent currentItem={currentItem} />
        )}

        {/* Log list / Console */}
        <DocsManagementScanProcessingLog
          items={items}
          isProcessing={isProcessing}
          error={error}
          currentItem={currentItem}
        />

        {/* Summary Footer */}
        {(summary || (!isProcessing && items.length > 0)) && (
          <DocsManagementScanFooter items={items} resetState={resetState} />
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {showCancelConfirm && (
        <DocsManagementScanCancel
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={onCancelIndexing}
        />
      )}
    </div>
  );
}
