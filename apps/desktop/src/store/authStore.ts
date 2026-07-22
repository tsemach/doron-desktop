import { atom, getDefaultStore } from "jotai";
import { invoke } from "@tauri-apps/api/core";

// Same VITE_BACKEND_URL convention as Login.tsx / AuthLanding.tsx.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export interface Session {
  token: string;
  email: string;
  tier: string;
  expires_at: string;
}

export const sessionAtom = atom<Session | null>(null);
export const sessionStatusAtom = atom<"idle" | "loading" | "ready">("idle");

// verify_session re-checks the cached session against the backend whenever
// online (falling back to the cached session if unreachable), so a deleted
// user or a tier change takes effect without waiting for the session's full
// local TTL to expire -- see auth::verify_session in the Rust backend.
export async function refreshSession() {
  const store = getDefaultStore();
  store.set(sessionStatusAtom, "loading");
  try {
    const session = await invoke<Session | null>("verify_session", { backendUrl: BACKEND_URL });
    const isExpired = session ? new Date(session.expires_at).getTime() < Date.now() : false;
    store.set(sessionAtom, isExpired ? null : session);
  } catch (err) {
    console.error("[authStore] Failed to load session:", err);
    store.set(sessionAtom, null);
  } finally {
    store.set(sessionStatusAtom, "ready");
  }
}

export async function clearSession() {
  const store = getDefaultStore();
  try {
    await invoke("clear_session");
  } finally {
    store.set(sessionAtom, null);
  }
}
