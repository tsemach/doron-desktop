import BackButton from "../ui/back-button";
import { useLanguage } from "../../context/LanguageContext";

export default function TaskManagementHeader() {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md shrink-0 px-6 py-4">
      <div className="flex items-center gap-3">
        <BackButton navigateTo="/" />
        <div className="h-6 w-[1px] bg-border" />
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            {t("task_management")}
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">
              Beta
            </span>
          </h1>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            All Tasks Across Every Case
          </p>
        </div>
      </div>
    </header>
  );
}
