import { Button } from "../ui/button";
import DocsManagementPicker from "./DocsManagementPicker";

type DocsManagementMenuProps = {
  disabled: boolean;
  showPicker: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onSelect: (path: string, isFolder: boolean) => void;
  scanCount?: { current: number; total: number };
  onTemplatesClick: () => void;
  onSearchClick: () => void;
};

export default function DocsManagementMenu({
  disabled,
  showPicker,
  onTogglePicker,
  onClosePicker,
  onSelect,
  scanCount,
  onTemplatesClick,
  onSearchClick,
}: DocsManagementMenuProps) {
  return (
    <>
      <div className="relative inline-block">
        <Button
          disabled={disabled}
          onClick={onTogglePicker}
          className="flex items-center gap-2"
        >
          Scan Documents
        </Button>
        <DocsManagementPicker
          show={showPicker}
          onClose={onClosePicker}
          onSelect={onSelect}
        />
      </div>

      {scanCount && (
        <span className="text-sm text-muted-foreground">
          {scanCount.current} / {scanCount.total}
        </span>
      )}      

      <Button disabled={disabled} onClick={onTemplatesClick} className="flex items-center gap-2">
        Templates
      </Button>
      
      <Button disabled={disabled} onClick={onSearchClick} className="flex items-center gap-2">
        Search
      </Button>
    </>    
  );
}
