import { useState } from "react";

import ScanCancel from "./ScanCancel";
import ScanFileCount from "./ScanFileCount";
import ScanFooter from "./ScanFooter";
import ScanProcessingActions, { type ScanResumeInfo } from "./ScanProcessingActions";
import ScanProcessingCurrent from "./ScanProcessingCurrent";
import ScanProcessingHeader from "./ScanProcessingHeader";
import ScanProcessingLog from "./ScanProcessingLog";
import ScanProcessingProgress from "./ScanProcessingProgress";
import type { IndexSummary, ProgressItem } from "./types";

interface ScanProcessingProps {
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
  resumeInfo: ScanResumeInfo | null;
  resetState?: () => void;
}

export default function ScanProcessing({
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
  resumeInfo,
  resetState,
}: ScanProcessingProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 animate-fade-in">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 items-center px-6 py-4 border-b border-border/60 bg-muted/30 gap-3">
          <ScanProcessingHeader
            isFolder={isFolder}
            selectedPath={selectedPath}
          />

          <div className="flex justify-center justify-self-center">
            {(isProcessing || items.length > 0) && (
              <ScanFileCount
                current={currentCount}
                total={totalCount}
              />
            )}
          </div>

          <ScanProcessingActions
            isProcessing={isProcessing}
            handleStopIndexing={handleStopIndexing}
            onShowCancelConfirm={() => setShowCancelConfirm(true)}
            summary={summary}
            selectedPath={selectedPath}
            isFolder={isFolder}
            startIndexing={startIndexing}
            resumeInfo={resumeInfo}
            resetState={resetState}
          />
        </div>

        {(isProcessing || items.some((i) => i.message === "Indexing stopped by user")) && (
          <ScanProcessingProgress progressPercent={progressPercent} />
        )}

        {isProcessing && (
          <ScanProcessingCurrent currentItem={currentItem} />
        )}

        <ScanProcessingLog
          items={items}
          isProcessing={isProcessing}
          error={error}
          currentItem={currentItem}
        />

        {(summary || (!isProcessing && items.length > 0)) && (
          <ScanFooter items={items} resetState={resetState} />
        )}
      </div>

      {showCancelConfirm && (
        <ScanCancel
          onClose={() => setShowCancelConfirm(false)}
          onConfirm={onCancelIndexing}
        />
      )}
    </div>
  );
}
