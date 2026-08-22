import DocsHeader from "@/components/app/documents/DocsHeader";

// Desktop's "Scan & Index" is a global folder-scan action; here, scanning
// is per-case (Phase 4's connect-folder flow lives in each case's
// Documents tab) since a browser can only access one granted folder at a
// time, not a global filesystem scan. This page explains that instead of
// duplicating the action.
export default function ScanPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <DocsHeader />
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Scanning happens per case — open a case and use its Documents tab to connect a local folder and index its files.
        </p>
      </div>
    </div>
  );
}
