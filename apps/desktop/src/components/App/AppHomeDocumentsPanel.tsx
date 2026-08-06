import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Search, LayoutTemplate } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

export default function AppHomeDocumentsPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSearch() {
    const trimmed = query.trim();
    // No prefill query is still a valid destination -- lands on the same
    // Smart Search screen the "Documents" card itself opens.
    navigate("/docs-management/search", trimmed ? { state: { initialQuery: trimmed } } : undefined);
  }

  return (
    <div className="w-96 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">{t("docs_management")}</span>
        <button
          type="button"
          onClick={() => navigate("/docs-management/scan")}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          <ScanLine className="size-3.5" />
          {t("scan_and_index")}
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("search_documents_placeholder")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate("/docs-management/templates")}
        className="group flex w-full items-center gap-3 px-4 py-2.5 border-t border-border hover:bg-accent/50 transition-colors cursor-pointer"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LayoutTemplate className="size-4" />
        </span>
        <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {t("documents_templates")}
        </span>
      </button>
    </div>
  );
}
