import { Button } from "../ui/button";

interface DocsManagementScanOpenBannerProps {
  isFolder: boolean;
  onOpen: () => void;
}

export default function DocsManagementScanOpenBanner({
  isFolder,
  onOpen,
}: DocsManagementScanOpenBannerProps) {
  const content = (
    <div className={`flex items-center justify-between text-xs animate-fade-in px-1 ${isFolder ? "col-start-1" : ""}`}>
      <div className="flex items-center gap-2 text-blue-600 font-medium">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 animate-pulse"
        >
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="M12 17v-4" />
          <path d="M12 9h.01" />
        </svg>
        <span className="font-semibold">
          Indexing is already in progress...
        </span>
      </div>
      <Button
        size="sm"
        onClick={onOpen}
        className="h-7 bg-blue-600 hover:bg-blue-750 text-white font-semibold text-[10px] px-3 shrink-0"
      >
        Open
      </Button>
    </div>
  );

  if (isFolder) {
    return content;
  }

  return (
    <>
      <div className="hidden md:block" />
      {content}
    </>
  );
}
