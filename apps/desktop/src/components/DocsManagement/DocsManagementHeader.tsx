import { useLocation, useNavigate } from "react-router-dom";
import BackButton from "../ui/back-button";
import { useLanguage } from "../../context/LanguageContext";
import AiStatusBadge from "../ui/AiStatusBadge";

type DocsManagementHeaderProps = {
  isAiConnected: boolean;
  dbPath: string;
  isProcessing: boolean;
  scanCount?: { current: number; total: number };
  resetState?: () => void;
};

export default function DocsManagementHeader({
  isAiConnected,
  dbPath,
  isProcessing,
  scanCount,
  resetState,
}: DocsManagementHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  // Helper to check active tab
  const getActiveTab = () => {
    const path = location.pathname;
    if (path.endsWith("/scan")) return "scan";
    if (path.endsWith("/templates")) return "templates";
    return "search";
  };

  const activeTab = getActiveTab();

  // Get database file name for badge
  const dbFileName = dbPath ? dbPath.split(/[/\\]/).pop() : "No Database Connected";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md shrink-0 px-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
        {/* Left Side: Back & Title */}
        <div className="flex items-center gap-3 justify-self-start">
          <BackButton navigateTo="/" />
          <div className="h-6 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary animate-pulse"
            >
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M12 17v-4" />
              <path d="M12 9h.01" />
            </svg>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-muted-foreground bg-clip-text text-transparent">
                Documents Vault
              </h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Enterprise Document AI
              </p>
            </div>
          </div>
        </div>

        {/* Center: Navigation Tabs */}
        <nav className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/40 max-w-fit justify-self-center">
          <button
            onClick={() => navigate("/docs-management")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${activeTab === "search"
                ? "bg-background text-foreground shadow-sm font-bold scale-102"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
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
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            {t("smart_search")}
          </button>
          <button
            onClick={() => {
              navigate("/docs-management/scan");
              if (resetState && !isProcessing) {
                resetState();
              }
            }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 relative ${activeTab === "scan"
                ? "bg-background text-foreground shadow-sm font-bold scale-102"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
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
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            </svg>
            {t("scan_and_index")}
            {isProcessing && (
              <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            )}
          </button>
          <button
            onClick={() => navigate("/docs-management/templates")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${activeTab === "templates"
                ? "bg-background text-foreground shadow-sm font-bold scale-102"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
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
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M7 7h10M7 12h10M7 17h10" />
            </svg>
            {t("documents_templates")}
          </button>
        </nav>

        {/* Right Side: Status Indicators */}
        <div className="flex items-center justify-end gap-3 flex-wrap justify-self-end">
          {/* Active Progress Badge */}
          {isProcessing && (
            <div className="flex items-center gap-2 bg-blue-50/50 border border-blue-200 rounded-full px-3 py-1 text-xs font-medium text-blue-700 animate-pulse">
              <span className="inline-block animate-spin">⟳</span>
              <span>
                {scanCount
                  ? `Indexing: ${scanCount.current}/${scanCount.total}`
                  : "Scanning..."}
              </span>
            </div>
          )}

          {/* Database Badge */}
          {dbPath && (
            <div
              className="flex items-center gap-1.5 bg-muted border border-border/80 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
              title={dbPath}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
              </svg>
              <span className="font-mono max-w-[120px] truncate">{dbFileName}</span>
            </div>
          )}

          {/* Reusable AI Connection Status Badge */}
          <AiStatusBadge />
        </div>
      </div>
    </header>
  );
}
