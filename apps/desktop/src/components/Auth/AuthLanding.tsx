import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import AuthCard from "./AuthCard";

// Same VITE_BACKEND_URL convention as DocsManagementTemplatesDownloadModal.tsx.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// 0.1 — component only, not wired into the app's default routing. That
// cutover is 0.10's job (AUTH_REQUIRED flag in App.tsx), so this screen can
// exist and be reached via /auth without affecting current app behavior.
export default function AuthLanding() {
  const navigate = useNavigate();

  async function handleRegister() {
    await openUrl(`${BACKEND_URL}/register?platform=desktop`);
  }

  return (
    <AuthCard title="Welcome to Amicus" subtitle="Create an account or sign in to continue.">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate("/auth/login")}
          className="w-full rounded-md border border-border py-2.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
        >
          Login
        </button>
        <button
          type="button"
          onClick={handleRegister}
          className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
        >
          Register
        </button>
      </div>
    </AuthCard>
  );
}
