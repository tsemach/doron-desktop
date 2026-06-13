import { Button } from "../../ui/button";
import { useLanguage } from "../../../context/LanguageContext";

export default function OpenCasesDocumentsPanelCaseFields({ onShowFields }: { onShowFields: () => void }) {
    const { t } = useLanguage();
    
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onShowFields}
        className="text-xs px-3 h-8 gap-1.5 border-border hover:bg-muted"
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
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h10" />
          <path d="M7 16h10" />
        </svg>
        {t("case_fields")}
      </Button>
    )
}