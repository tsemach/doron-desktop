import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Briefcase, FileText } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useAtomValue } from "jotai";
import { isProcessingAtom } from "../../store/indexStore";
import { clearSession } from "../../store/authStore";
import AppHomeRecentCases from "./AppHomeRecentCases";
import AppHomeDocumentsPanel from "./AppHomeDocumentsPanel";
import { AppUserMenu } from "./AppUserMenu";
import { AppHomeWelcome } from "./AppHomeWelcome";
import { AppHomeOverview } from "./AppHomeOverview";

// Same VITE_BACKEND_URL convention as Auth/AuthLanding.tsx.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// Compact icon tile for the two primary nav destinations -- label sits below
// the tile rather than inside it, so the tile itself stays a simple square.
const NAV_TILE_CLASS =
  "relative size-48 shrink-0 rounded-2xl border border-border bg-muted/40 hover:bg-accent hover:border-foreground/25 shadow-sm transition-colors flex items-center justify-center text-foreground/70 hover:text-foreground cursor-pointer";

export default function AppHome() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const isProcessing = useAtomValue(isProcessingAtom);

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

  function handleTaskManagement() {
    navigate("/task-management");
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

  async function handleLogout() {
    // Clears the local session (App.tsx's `gated` check then swaps straight
    // to AppLogin -- no manual navigation needed here).
    await clearSession();
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground px-10 py-10">
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <AppHomeWelcome />
        <AppUserMenu
          handleSettings={handleSettings}
          handleUpgrade={handleUpgrade}
          handleLogout={handleLogout}
        />
      </div>

      <div className="flex-1 flex items-start justify-center mt-52">
        <div className="w-full max-w-7xl mx-auto flex items-start justify-between gap-24 px-6">

          {/* Primary navigation wrapper - Aligns content strictly to the left edge */}
          <div className="flex flex-col gap-16 justify-self-start">
            <div className="flex items-start gap-20">
              <button type="button" onClick={handleCaseMagement} className={NAV_TILE_CLASS}>
                <div className="flex flex-col items-center gap-2">
                  <Briefcase className="size-8" />
                  <span className="text-2xl font-medium text-foreground/80">{t("cases")}</span>
                </div>
              </button>
              <AppHomeRecentCases />
            </div>

            <div className="flex items-start gap-20">
              <button type="button" onClick={handleDocsManagement} className={NAV_TILE_CLASS}>
                <div className="flex flex-col items-center gap-2">
                  <FileText className="size-8" />
                  <span className="text-2xl font-medium text-foreground/80">{t("documents")}</span>
                </div>
                {isProcessing && (
                  <span className="absolute bottom-2 right-2 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </button>
              <div className="flex flex-col items-end gap-2 w-96">
                <AppHomeDocumentsPanel />
                <div className="flex items-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={handleSettings}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 flex items-center gap-1.5 cursor-pointer"
                  >
                    {t("settings_footer")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AppHomeOverview />

        </div>
      </div>
    </div>
  );
}
