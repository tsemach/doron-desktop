import { useEffect } from "react";
import { LanguageProvider } from "./context/LanguageContext";
import UpdateBanner from "./components/Updater/UpdateBanner";
import { triggerGlobalHealthCheck } from "./store/aiStore";
import { useAtomValue } from "jotai";
import DocsManagementScanBackgroundIndexer from "./components/DocsManagement/DocsManagementScanBackgroundIndexer";
import { refreshSession, sessionAtom, sessionStatusAtom } from "./store/authStore";
import AppMain from "./components/App/AppMain";
import AppLogin from "./components/App/AppLogin";

// 0.10 — the sole switch for the register/login cutover. Defaulted to false
// so this ships without locking out any existing (currently session-less)
// user; flipping to true is a deliberate, separate follow-up once 0.1-0.9
// are verified working end to end. See PLAN.md Phase 0.
const AUTH_REQUIRED = false;

function App() {
  const session = useAtomValue(sessionAtom);
  const sessionStatus = useAtomValue(sessionStatusAtom);

  useEffect(() => {
    triggerGlobalHealthCheck().catch((err) => {
      console.error("[App] Initial health check failed:", err);
    });
    // Always refreshed, not just when AUTH_REQUIRED is on (Phase 2 / AMI-55):
    // feature gating (featureGating.ts) needs the real tier from whatever
    // session happens to exist locally, independent of whether the login
    // wall is enforced.
    refreshSession();
  }, []);

  const gated = AUTH_REQUIRED && sessionStatus === "ready" && !session;

  return (
    <LanguageProvider>
      <UpdateBanner />
      <DocsManagementScanBackgroundIndexer />
      {gated ? <AppLogin /> : <AppMain />}
    </LanguageProvider>
  );
}

export default App;
