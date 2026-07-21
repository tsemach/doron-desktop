import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LanguageProvider } from "./context/LanguageContext";
import UpdateBanner from "./components/Updater/UpdateBanner";
import { triggerGlobalHealthCheck } from "./store/aiStore";
import { useAtomValue } from "jotai";
import DocsManagementScanBackgroundIndexer from "./components/DocsManagement/DocsManagementScanBackgroundIndexer";
import { refreshSession, sessionAtom, sessionStatusAtom } from "./store/authStore";
import AppMain from "./components/App/AppMain";
import AppLogin from "./components/App/AppLogin";

// 0.10 — the sole switch for the register/login cutover. Flipped on
// 2026-07-21 once 0.1-0.9 were verified working end to end. See PLAN.md
// Phase 0.
const AUTH_REQUIRED = true;

function App() {
  const session = useAtomValue(sessionAtom);
  const sessionStatus = useAtomValue(sessionStatusAtom);
  const navigate = useNavigate();

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

  useEffect(() => {
    // Sent by lib.rs's doron-desktop://login handler -- the email
    // verification page's "sign in" link, for a desktop-originated
    // registration, deep-links here instead of opening the browser login.
    const unlisten = listen<string>("deep-link-navigate", (event) => {
      navigate(event.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [navigate]);

  useEffect(() => {
    // Revalidates the cached session (verify_session, AMI-64) whenever the
    // window regains focus, not just at startup -- otherwise a tier change
    // made elsewhere (e.g. upgrading to Pro from the web portal) never
    // reaches an already-running desktop app until it's restarted.
    const unlistenPromise = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        refreshSession();
      }
    });
    return () => {
      unlistenPromise.then((f) => f());
    };
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
