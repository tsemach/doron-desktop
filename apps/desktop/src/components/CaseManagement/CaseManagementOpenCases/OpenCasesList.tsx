import OpenCasesListItem from "./OpenCasesListItem";
import { useLanguage } from "../../../context/LanguageContext";

import { Case, CaseStatus } from "../CaseManagementTypes";
export type { Case, CaseStatus };

interface OpenCasesListProps {
  cases: Case[];
  selectedCase: Case | null;
  loading: boolean;
  isLgScreen: boolean;
  leftPercent: number;
  onSelectCase: (c: Case) => void;
  onCloseCase: (id: string) => void;
  onDeleteCase: (c: Case) => void;
  onOpenFolder: (folderPath: string) => void;
}

export default function OpenCasesList({
  cases,
  selectedCase,
  loading,
  isLgScreen,
  leftPercent,
  onSelectCase,
  onCloseCase,
  onDeleteCase,
  onOpenFolder,
}: OpenCasesListProps) {
  const { t } = useLanguage();

  return (
    <div
      style={isLgScreen ? { flex: `0 0 calc(${leftPercent}% - 6px)` } : undefined}
      className={`flex flex-col border border-border rounded-xl bg-card overflow-hidden min-h-0 flex-1 ${isLgScreen ? "h-full" : ""} shadow-xs`}
    >
      <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
        <span>{t("cases_list")}</span>
        <span className="text-xs text-muted-foreground font-normal">{cases.length} {t("visible")}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <div className="animate-spin text-2xl font-bold mb-2">⟳</div>
            <p className="text-sm">{t("loading_cases")}</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground py-12">
            <p className="text-sm">{t("no_cases_match")}</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0 z-10 border-b border-border">
              <tr>
                <th className="text-left rtl:text-right px-4 py-3 font-medium">{t("case_info")}</th>
                <th className="text-left rtl:text-right px-4 py-3 font-medium">{t("status")}</th>
                <th className="text-left rtl:text-right px-4 py-3 font-medium">{t("created")}</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <OpenCasesListItem
                  key={c.id}
                  c={c}
                  isSelected={selectedCase?.id === c.id}
                  onSelectCase={onSelectCase}
                  onCloseCase={onCloseCase}
                  onDeleteCase={onDeleteCase}
                  onOpenFolder={onOpenFolder}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
