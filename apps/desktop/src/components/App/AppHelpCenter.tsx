import { Briefcase, CalendarDays, FileText, Search, Settings as SettingsIcon } from "lucide-react";
import { HelpCenterPage, HelpCenterSearchBar, type HelpCenterTopic } from "@workspace/ui";
import BackButton from "../ui/back-button";
import { useLanguage } from "../../context/LanguageContext";

export default function AppHelpCenter() {
  const { t } = useLanguage();

  // Step 1: static placeholders -- no onClick yet, content lands later.
  const topics: HelpCenterTopic[] = [
    { key: "documents_templates", label: t("documents_templates"), icon: FileText },
    { key: "template", label: t("template"), icon: Briefcase },
    { key: "search_the_system", label: t("search_the_system"), icon: Search },
    { key: "calendar", label: t("calendar"), icon: CalendarDays },
    { key: "settings", label: t("settings"), icon: SettingsIcon },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Same sticky-header convention as CalendarHeader/DocsManagementHeader
          so the back button lands in the same spot as on every other page. */}
      <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md shrink-0 px-6 py-4">
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 flex items-center">
            <BackButton navigateTo="/" />
          </div>
          <HelpCenterSearchBar placeholder={t("search")} className="mx-auto max-w-xl" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
        <HelpCenterPage topics={topics} />
      </div>
    </div>
  );
}
