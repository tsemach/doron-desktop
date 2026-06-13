import { open } from "@tauri-apps/plugin-dialog";

type Props = {
  show: boolean;
  onClose: () => void;
  onSelect: (path: string, isFolder: boolean) => void;
};

export default function DocsManagementPicker({ show, onClose, onSelect }: Props) {
  async function handleSelectFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["docx", "pdf", "xlsx", "xls", "txt"] }],
    });
    if (selected && typeof selected === "string") {
      onSelect(selected, false);
    }
    onClose();
  }

  async function handleSelectFolder() {
    const selected = await open({ directory: true });
    if (selected && typeof selected === "string") {
      onSelect(selected, true);
    }
    onClose();
  }

  if (!show) return null;

  return (
    <div className="absolute left-0 top-full z-10 flex flex-col rounded-md border bg-popover shadow-md overflow-hidden">
      <button
        className="px-4 py-2 text-sm text-left hover:bg-accent transition-colors whitespace-nowrap"
        onClick={handleSelectFile}
      >
        Select File
      </button>
      <button
        className="px-4 py-2 text-sm text-left hover:bg-accent transition-colors whitespace-nowrap"
        onClick={handleSelectFolder}
      >
        Select Folder
      </button>
    </div>
  );
}
