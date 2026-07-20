import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";

// TODO: not configurable yet, same as auth/mod.rs's BACKEND_BASE_URL on the Rust side.
const BACKEND_BASE_URL = "http://localhost:3000";

// 0.1 — component only, not wired into the app's default routing. That
// cutover is 0.10's job (AUTH_REQUIRED flag in App.tsx), so this screen can
// exist and be reached via /auth without affecting current app behavior.
export default function AuthLanding() {
  const navigate = useNavigate();

  async function handleRegister() {
    await openUrl(`${BACKEND_BASE_URL}/register?platform=desktop`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background text-foreground px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-lg font-semibold">A</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Amicus</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create an account or sign in to continue.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={handleRegister}
          className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
        >
          Register
        </button>
        <button
          type="button"
          onClick={() => navigate("/auth/login")}
          className="w-full rounded-md border border-border py-2.5 text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
        >
          Login
        </button>
      </div>
    </div>
  );
}
