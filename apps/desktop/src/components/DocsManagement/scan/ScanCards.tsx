import ScanFolder from "./ScanFolder";
import ScanDocument from "./ScanDocument";

interface ScanCardsProps {
  isDisabled: boolean;
  isFolderActive: boolean;
  onSelectFolder: () => void;
  onSelectFile: () => void;
}

export default function ScanCards({
  isDisabled,
  isFolderActive,
  onSelectFolder,
  onSelectFile,
}: ScanCardsProps) {
  return (
    <>
      <ScanFolder
        isDisabled={isDisabled}
        isFolderActive={isFolderActive}
        onSelectFolder={onSelectFolder}
      />

      <ScanDocument
        isDisabled={isDisabled}
        isFolderActive={isFolderActive}
        onSelectFile={onSelectFile}
      />
    </>
  );
}
