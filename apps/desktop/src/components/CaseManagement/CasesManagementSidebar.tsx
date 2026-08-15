import { useNavigate, useLocation } from "react-router-dom";
import BackButton from "../ui/back-button";
import SidebarNavButton from "./SidebarNavButton";
import SidebarProfileFooter from "./SidebarProfileFooter";
import { useLanguage } from "../../context/LanguageContext";

export default function CaseManagementSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { t } = useLanguage();

  const isOpenCasesActive =
    pathname === "/case-management" ||
    (pathname.startsWith("/case-management") &&
      !pathname.startsWith("/case-management/templates") &&
      !pathname.startsWith("/case-management/task-templates") &&
      !pathname.startsWith("/case-management/new-case"));

  const isNewCaseActive = pathname.startsWith("/case-management/new-case");
  const isTemplatesActive = pathname.startsWith("/case-management/templates");
  const isTaskTemplatesActive = pathname.startsWith("/case-management/task-templates");

  return (
    <aside className="w-28 shrink-0 flex flex-col py-4 px-2 border-r rtl:border-r-0 rtl:border-l border-border">
      <BackButton navigateTo={"/"} />

      <div className="border-t border-border -mx-2 mt-2" />

      {/* Navigation Menu (Top-aligned) */}
      <div className="flex-1 flex flex-col mt-4">
        <div className="flex flex-col gap-3">
          <SidebarNavButton
            label={t("open_cases")}
            active={isOpenCasesActive}
            onClick={() => navigate("/case-management")}
          />
          <SidebarNavButton
            label={t("new_case")}
            active={isNewCaseActive}
            onClick={() => navigate("/case-management/new-case")}
          />
        </div>

        <div className="border-t border-border -mx-2 my-4" />

        <div className="flex flex-col gap-3">
          <SidebarNavButton
            label={t("template")}
            active={isTemplatesActive}
            onClick={() => navigate("/case-management/templates")}
          />
          <SidebarNavButton
            label={t("task_templates")}
            active={isTaskTemplatesActive}
            onClick={() => navigate("/case-management/task-templates")}
          />
        </div>
      </div>

      <SidebarProfileFooter />
    </aside>
  );
}
