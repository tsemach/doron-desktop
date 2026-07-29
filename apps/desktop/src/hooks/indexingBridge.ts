import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getDefaultStore } from "jotai";

import type { IndexingSession, IndexSummary, ProgressItem, ProgressStatus } from "@/components/DocsManagement/scan/types";
import {
  errorAtom,
  isFolderAtom,
  isProcessingAtom,
  itemsAtom,
  selectedPathAtom,
  showOutputAtom,
  summaryAtom,
} from "@/store/indexStore";

import { pickLatestActiveIndexingSession } from "@/lib/indexing";

export type IndexProgressEvent = {
  file_name: string;
  status: string;
  message: string;
  current: number;
  total: number;
};

type IndexingStartedEvent = {
  path: string;
  is_folder: boolean;
};

type IndexingFinishedEvent = {
  path: string;
  is_folder: boolean;
  summary: IndexSummary | null;
  error: string | null;
};

let bridgeInitialized = false;
let indexingCancelled = false;
const unlisteners: UnlistenFn[] = [];

export function markIndexingCancelled() {
  indexingCancelled = true;
}

export function clearIndexingCancelled() {
  indexingCancelled = false;
}

function applyProgressUpdate(setItems: (update: (prev: ProgressItem[]) => ProgressItem[]) => void, event: IndexProgressEvent) {
  const { file_name, status, message, current, total } = event;
  if (!file_name || file_name.trim() === "" || message === "Indexing stopped by user") {
    return;
  }

  setItems((prev) => {
    const idx = prev.findIndex((p) => p.current === current || (p.file_name === file_name && !p.current));
    if (idx !== -1 && prev[idx].status === "ok" && status === "skipped") {
      const next = [...prev];
      next[idx] = {
        ...prev[idx],
        current,
        total,
      };
      return next;
    }

    const item: ProgressItem = {
      file_name,
      status: status as ProgressStatus,
      message,
      current,
      total,
    };
    if (idx === -1) return [...prev, item];
    const next = [...prev];
    next[idx] = item;
    return next;
  });
}

export async function initIndexingBridge() {
  if (bridgeInitialized) return;
  bridgeInitialized = true;

  const store = getDefaultStore();

  unlisteners.push(
    await listen<IndexingStartedEvent>("indexing-started", (event) => {
      clearIndexingCancelled();
      store.set(isProcessingAtom, true);
      store.set(selectedPathAtom, event.payload.path);
      store.set(isFolderAtom, event.payload.is_folder);
      store.set(errorAtom, null);
      store.set(summaryAtom, null);
    }),
  );

  unlisteners.push(
    await listen<IndexProgressEvent>("indexing-progress", (event) => {
      applyProgressUpdate(
        (update) => store.set(itemsAtom, update(store.get(itemsAtom))),
        event.payload,
      );
    }),
  );

  unlisteners.push(
    await listen<IndexingFinishedEvent>("indexing-finished", (event) => {
      if (indexingCancelled) return;

      store.set(isProcessingAtom, false);
      store.set(selectedPathAtom, event.payload.path);
      store.set(isFolderAtom, event.payload.is_folder);
      store.set(summaryAtom, event.payload.summary);
      store.set(errorAtom, event.payload.error);
    }),
  );

  try {
    const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
    const activeSession = pickLatestActiveIndexingSession(sessions);
    if (!activeSession) return;

    store.set(selectedPathAtom, activeSession.path);
    store.set(isFolderAtom, activeSession.is_folder);
    if (activeSession.status === "running") {
      store.set(isProcessingAtom, true);
      store.set(showOutputAtom, false);
    }
  } catch (err) {
    console.error("[indexingBridge] Failed to hydrate active indexing session:", err);
  }
}

export function teardownIndexingBridge() {
  for (const unlisten of unlisteners) {
    unlisten();
  }
  unlisteners.length = 0;
  bridgeInitialized = false;
}
