import { Button } from "../../ui/button";
import type { IndexSummary } from "./types";

export type ScanResumeInfo = {
  startIndex: number;
  reindex: boolean;
};

interface ScanProcessingActionsProps {
  isProcessing: boolean;
  handleStopIndexing: () => void;
  onShowCancelConfirm: () => void;
  summary: IndexSummary | null;
  selectedPath: string;
  isFolder: boolean;
  startIndexing: (path: string, isFolder: boolean, isContinue?: boolean, startIndex?: number, reindex?: boolean) => void;
  resumeInfo: ScanResumeInfo | null;
  resetState?: () => void;
}

export default function ScanProcessingActions({
  isProcessing,
  handleStopIndexing,
  onShowCancelConfirm,
  summary,
  selectedPath,
  isFolder,
  startIndexing,
  resumeInfo,
  resetState,
}: ScanProcessingActionsProps) {
  return (
    <div className="flex items-center gap-2 justify-self-end">
      {isProcessing ? (
        <>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs font-semibold"
            onClick={handleStopIndexing}
          >
            Stop
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold border-muted-foreground/30 text-muted-foreground hover:bg-muted"
            onClick={onShowCancelConfirm}
          >
            Cancel
          </Button>
        </>
      ) : !summary ? (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-semibold border-blue-200 text-blue-700 hover:bg-blue-50/50"
            onClick={() => startIndexing(selectedPath, isFolder, false, 0)}
          >
            Restart
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-750 text-white"
            disabled={!resumeInfo}
            onClick={() => {
              if (!resumeInfo) return;
              startIndexing(
                selectedPath,
                isFolder,
                true,
                resumeInfo.startIndex,
                resumeInfo.reindex,
              );
            }}
          >
            Continue
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold border-muted-foreground/30 text-muted-foreground hover:bg-muted"
            onClick={onShowCancelConfirm}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => resetState?.()}
        >
          Close
        </Button>
      )}
    </div>
  );
}
