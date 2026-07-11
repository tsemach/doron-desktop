import DocsManagementScanCards from "./DocsManagementScanCards";
import DocsManagementScanOpenBanner from "./DocsManagementScanOpenBanner";
import { IndexingSession } from "./DocsManagementScan";

interface DocsManagementScanMenuProps {
  isDisabled: boolean;
  isFolderActive: boolean;
  activeSession: IndexingSession | null;
  onSelectFolder: () => void;
  onSelectFile: () => void;
  onOpenActiveSession: () => void;
}

export default function DocsManagementScanMenu({
  isDisabled,
  isFolderActive,
  activeSession,
  onSelectFolder,
  onSelectFile,
  onOpenActiveSession,
}: DocsManagementScanMenuProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
      <DocsManagementScanCards
        isDisabled={isDisabled}
        isFolderActive={isFolderActive}
        onSelectFolder={onSelectFolder}
        onSelectFile={onSelectFile}
      />

      {/* Row 2: Status Banners */}
      {activeSession && isFolderActive && (
        <DocsManagementScanOpenBanner
          isFolder={true}
          onOpen={onOpenActiveSession}
        />
      )}

      {activeSession && !isFolderActive && (
        <DocsManagementScanOpenBanner
          isFolder={false}
          onOpen={onOpenActiveSession}
        />
      )}
    </div>
  );
}
