import DocsManagementScanFolder from "./DocsManagementScanFolder";
import DocsManagementScanDocument from "./DocsManagementScanDocument";

interface DocsManagementScanCardsProps {
  isDisabled: boolean;
  isFolderActive: boolean;
  onSelectFolder: () => void;
  onSelectFile: () => void;
}

export default function DocsManagementScanCards({
  isDisabled,
  isFolderActive,
  onSelectFolder,
  onSelectFile,
}: DocsManagementScanCardsProps) {
  return (
    <>
      <DocsManagementScanFolder
        isDisabled={isDisabled}
        isFolderActive={isFolderActive}
        onSelectFolder={onSelectFolder}
      />

      <DocsManagementScanDocument
        isDisabled={isDisabled}
        isFolderActive={isFolderActive}
        onSelectFile={onSelectFile}
      />
    </>
  );
}
