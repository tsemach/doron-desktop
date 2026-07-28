import { open } from "@tauri-apps/plugin-dialog";

export const INDEXABLE_DOCUMENT_EXTENSIONS = ["docx", "pdf", "xlsx", "xls", "txt"] as const;

export async function pickIndexableDocumentFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Documents", extensions: [...INDEXABLE_DOCUMENT_EXTENSIONS] }],
  });

  return selected && typeof selected === "string" ? selected : null;
}

export async function pickIndexableDocumentFolder(): Promise<string | null> {
  const selected = await open({ directory: true });

  return selected && typeof selected === "string" ? selected : null;
}
