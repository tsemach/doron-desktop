import BackButton from "../ui/back-button";
import SidebarNavButton from "./SidebarNavButton";
import SidebarProfileFooter from "./SidebarProfileFooter";
import { useLanguage } from "../../context/LanguageContext";

export type CaseDetailTab = "preview" | "emails" | "tasks";

interface CaseDetailSidebarProps {
  activeRightTab: CaseDetailTab;
  onTabChange: (tab: CaseDetailTab) => void;
  onEditTagsNotes: () => void;
}

export default function CaseDetailSidebar({ activeRightTab, onTabChange, onEditTagsNotes }: CaseDetailSidebarProps) {
  const { t } = useLanguage();

  return (
    <aside className="w-28 shrink-0 flex flex-col py-4 px-2 border-r rtl:border-r-0 rtl:border-l border-border">
      <BackButton navigateTo="/case-management" label={t("cases")} title={t("back_to_open_cases")} className="text-xs" />

      <div className="border-t border-border -mx-2 mt-2" />

      <div className="flex-1 flex flex-col mt-4">
        <div className="flex flex-col gap-3">
          <SidebarNavButton
            label={t("overview")}
            active={activeRightTab === "preview"}
            onClick={() => onTabChange("preview")}
          />
          <SidebarNavButton
            label={t("emails")}
            active={activeRightTab === "emails"}
            onClick={() => onTabChange("emails")}
          />
          <SidebarNavButton
            label={t("tasks")}
            active={activeRightTab === "tasks"}
            onClick={() => onTabChange("tasks")}
          />
        </div>

        <div className="border-t border-border -mx-2 my-4" />

        <div className="flex flex-col gap-3">
          <SidebarNavButton
            label={t("tags_notes")}
            active={false}
            onClick={onEditTagsNotes}
          />
        </div>
      </div>

      <SidebarProfileFooter />
    </aside>
  );
}
