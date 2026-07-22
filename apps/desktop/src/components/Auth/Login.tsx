import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Eye, EyeOff } from "lucide-react";
import { refreshSession, sessionAtom } from "@/store/authStore";
import { useAtomValue } from "jotai";
import AuthCard from "./AuthCard";

// Same VITE_BACKEND_URL convention as DocsManagementTemplatesDownloadModal.tsx.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

// Same shape the backend's signup route enforces server-side
// (apps/backend/lib/validation.ts) -- kept light here since this is just
// login, not account creation: a malformed email simply won't match any
// account and fails safely either way.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 0.6 — password login (0.7) is a direct Tauri command call, no browser.
// Google/Facebook (0.9) open the system browser and come back via the
// doron-desktop:// deep link — this screen re-checks the local session on
// window focus (and via a manual fallback button) to notice when that lands.
export default function Login() {
  const navigate = useNavigate();
  const session = useAtomValue(sessionAtom);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [waitingForOAuth, setWaitingForOAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (session) {
      navigate("/");
    }
  }, [session, navigate]);

  useEffect(() => {
    if (!waitingForOAuth) return;
    function onFocus() {
      refreshSession();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [waitingForOAuth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!EMAIL_RE.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await invoke("login_with_credentials", { backendUrl: BACKEND_URL, email, password });
      await refreshSession();
    } catch (err: any) {
      setError(typeof err === "string" ? err : "Invalid email or password");
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "facebook") {
    setError("");
    setWaitingForOAuth(true);
    await openUrl(`${BACKEND_URL}/login?platform=desktop&provider=${provider}`);
  }

  return (
    <AuthCard title="Sign in to Amicus" backTo="/">
      {waitingForOAuth ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            Complete sign-in in your browser, then come back here.
          </p>
          <button
            type="button"
            onClick={() => refreshSession()}
            className="text-sm font-medium underline cursor-pointer"
          >
            I've finished — continue
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  maxLength={16}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSocial("google")}
              className="rounded-md border border-border py-2 text-xs font-medium hover:bg-accent transition-colors cursor-pointer"
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => handleSocial("facebook")}
              className="rounded-md border border-border py-2 text-xs font-medium hover:bg-accent transition-colors cursor-pointer"
            >
              Facebook
            </button>
          </div>
        </>
      )}
    </AuthCard>
  );
}
