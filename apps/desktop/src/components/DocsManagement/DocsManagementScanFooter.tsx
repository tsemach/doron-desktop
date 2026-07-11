import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { Button } from "../ui/button";
import { ProgressItem } from "./DocsManagementScan";

interface DocsManagementScanFooterProps {
  items: ProgressItem[];
  resetState?: () => void;
}

export default function DocsManagementScanFooter({
  items,
  resetState,
}: DocsManagementScanFooterProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="border-t border-border/80 bg-muted/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="font-semibold">{items.filter((i) => i.status === "ok").length} Indexed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/60" />
          <span className="font-semibold">{items.filter((i) => i.status === "skipped").length} Skipped</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="font-semibold text-red-600">{items.filter((i) => i.status === "failed").length} Failed</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {items.some((i) => i.message === "Indexing stopped by user") && (
          <div className="flex items-center gap-1.5 bg-red-50/50 border border-red-200 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold text-red-600 mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Stopped
          </div>
        )}
        <Button size="sm" variant="outline" onClick={() => navigate("/docs-management/search")}>
          {t("go_to_smart_search")}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (resetState) {
              resetState();
            } else {
              navigate("/docs-management/scan");
            }
          }}
        >
          Index Another File/Folder
        </Button>
      </div>
    </div>
  );
}
