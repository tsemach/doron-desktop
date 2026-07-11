import { atom } from "jotai";
import { type ProgressItem, type IndexSummary } from "../components/DocsManagement/DocsManagementScan";

export const showOutputAtom = atom<boolean>(false);
export const isProcessingAtom = atom<boolean>(false);
export const selectedPathAtom = atom<string>("");
export const isFolderAtom = atom<boolean>(false);
export const itemsAtom = atom<ProgressItem[]>([]);
export const summaryAtom = atom<IndexSummary | null>(null);
export const errorAtom = atom<string | null>(null);
export const dbPathAtom = atom<string>("");
