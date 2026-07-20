import { atom, getDefaultStore } from "jotai";
import { invoke } from "@tauri-apps/api/core";

export interface Session {
  token: string;
  email: string;
  tier: string;
  expires_at: string;
}

export const sessionAtom = atom<Session | null>(null);
export const sessionStatusAtom = atom<"idle" | "loading" | "ready">("idle");

export async function refreshSession() {
  const store = getDefaultStore();
  store.set(sessionStatusAtom, "loading");
  try {
    const session = await invoke<Session | null>("get_session");
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
