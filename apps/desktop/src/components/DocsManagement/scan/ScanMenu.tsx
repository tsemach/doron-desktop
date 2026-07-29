import ScanCards from "./ScanCards";
import ScanOpenBanner from "./ScanOpenBanner";
import type { IndexingSession } from "./types";

interface ScanMenuProps {
  isDisabled: boolean;
  isFolderActive: boolean;
  activeSession: IndexingSession | null;
  onSelectFolder: () => void;
  onSelectFile: () => void;
  onOpenActiveSession: () => void;
}

export default function ScanMenu({
  isDisabled,
  isFolderActive,
  activeSession,
  onSelectFolder,
  onSelectFile,
  onOpenActiveSession,
}: ScanMenuProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
      <ScanCards
        isDisabled={isDisabled}
        isFolderActive={isFolderActive}
        onSelectFolder={onSelectFolder}
        onSelectFile={onSelectFile}
      />

      {activeSession && isFolderActive && (
        <ScanOpenBanner
          isFolder={true}
          onOpen={onOpenActiveSession}
        />
      )}

      {activeSession && !isFolderActive && (
        <ScanOpenBanner
          isFolder={false}
          onOpen={onOpenActiveSession}
        />
      )}
    </div>
  );
}
