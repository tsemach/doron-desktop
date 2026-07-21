import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { User, Settings, Sparkles } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useAtomValue } from "jotai";
import { isProcessingAtom } from "../../store/indexStore";
import { useSubscriptionTier } from "../../lib/featureGating";
import PlanBadge from "../ui/PlanBadge";
import KebabMenu from "../ui/KebabMenu";

// Same VITE_BACKEND_URL convention as Auth/AuthLanding.tsx.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export default function AppHome() {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>(() => localStorage.getItem("user_name") || "");
  const [nameInput, setNameInput] = useState("");
  const { t } = useLanguage();
  const isProcessing = useAtomValue(isProcessingAtom);
  const tier = useSubscriptionTier();

  useEffect(() => {
    const setupWindow = async () => {
      const appWindow = getCurrentWindow();

      await new Promise(r => setTimeout(r, 50));
      await appWindow.center();
      await appWindow.maximize();
    };

    setupWindow();
  }, []);

  function handleCaseMagement() {
    navigate("/case-management");
  }

  function handleDocsManagement() {
    navigate("/docs-management");
  }

  function handleSettings() {
    navigate("/settings");
  }

  async function handleUpgrade() {
    // No in-app checkout on desktop -- opens the same plan/checkout page the
    // web portal's own "Upgrade" pill uses (MainTopBarUser.tsx), in the
    // system browser, matching how Register/Login already leave the app for
    // browser-only steps (Auth/AuthLanding.tsx, Auth/Login.tsx).
    await openUrl(`${BACKEND_URL}/register/plan?platform=desktop`);
  }

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (trimmed) {
      localStorage.setItem("user_name", trimmed);
      setUsername(trimmed);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground justify-center items-center px-4 py-12">
      <div className="absolute top-6 right-6">
        <KebabMenu
          title="Account"
          triggerIcon={<User className="size-6" />}
          triggerClassName="h-14 w-14 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
          items={[
            {
              label: t("settings_footer"),
              icon: <Settings className="size-4" />,
              onClick: handleSettings,
            },
            {
              label: "Upgrade to Pro",
              icon: <Sparkles className="size-4" />,
              onClick: handleUpgrade,
              hidden: tier === "pro",
            },
          ]}
        />
      </div>

      <div className="max-w-5xl w-full flex flex-col items-center gap-12">
        {/* Welcome Title & Input */}
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">
            {username ? (
              <>
                {t("welcome")}, {username} <PlanBadge />
              </>
            ) : (
              t("welcome_workspace")
            )}
          </h2>

          {/* Show input below the heading if name doesn't exist */}
          {!username && (
            <form onSubmit={handleSaveName} className="flex items-center justify-center gap-2 mt-6">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t("enter_name")}
                className="border border-border/80 rounded-lg px-4 py-2 text-sm bg-background w-64 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="submit"
                className="bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black font-bold text-sm px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                {t("save")}
              </button>
            </form>
          )}

          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            {t("home_desc")}
          </p>
        </div>

        {/* Action cards & Settings Wrapper */}
        <div className="w-full max-w-[1008px] flex flex-col gap-2">
          {/* Action cards - Keep Case Management and Document Management as is */}
          <div className="flex flex-col md:flex-row justify-center gap-8 w-full">
            <button
              type="button"
              onClick={handleCaseMagement}
              className="border-4 text-[rgb(120,120,120)] hover:border-gray-400 rounded h-60 w-full md:w-120 px-4 py-2 text-[48px] font-large hover:border-blue-500 transition-colors flex items-center justify-center cursor-pointer bg-card hover:bg-accent/10"
            >
              {t("case_management")}
            </button>
            <button
              type="button"
              onClick={handleDocsManagement}
              className="border-4 text-[rgb(120,120,120)] hover:border-gray-400 rounded h-60 w-full md:w-120 px-4 py-2 text-[48px] font-large hover:border-blue-500 transition-colors flex items-center justify-center cursor-pointer bg-card hover:bg-accent/10 relative"
            >
              {t("docs_management")}
              {isProcessing && (
                <span className="absolute bottom-4 right-4 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500"></span>
                </span>
              )}
            </button>
          </div>

          {/* Footer Settings Link */}
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={handleSettings}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 flex items-center gap-1.5 cursor-pointer"
            >
              {t("settings_footer")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
