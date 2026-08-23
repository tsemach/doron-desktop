// Client-side only. Dispatches text extraction by file extension for the
// scan pipeline (lib/documents/scanning.ts) -- txt is trivially the
// file's own text; docx/pdf need real parsing libraries (mammoth /
// pdfjs-dist), matching desktop's extractor/{docx,pdf}.rs but running
// entirely in the browser, since this backend never receives raw file
// bytes server-side (Core Decision 2, docs/backend-saas/
// phase-4-local-documents/design.md). doc (legacy binary Word)/xls/xlsx
// aren't extracted yet -- still registered, just not searchable.

const EXTRACTABLE_EXTENSIONS = new Set(["txt", "docx", "pdf"]);

export function isExtractableFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext !== undefined && EXTRACTABLE_EXTENSIONS.has(ext);
}

let pdfjsWorkerConfigured = false;

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  if (!pdfjsWorkerConfigured) {
    // Self-hosted (apps/backend/public/pdf.worker.min.mjs, copied from
    // the pdfjs-dist package at the same pinned version desktop uses) --
    // pdfjs otherwise defaults to fetching its worker from a CDN.
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    pdfjsWorkerConfigured = true;
  }

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pageTexts.join("\n\n");
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

// Returns null for an unsupported file type or a failed extraction (e.g.
// a corrupt/encrypted PDF) -- the caller treats that the same as before:
// the document is still registered and openable, just not searchable.
export async function extractText(fileName: string, file: File): Promise<string | null> {
  const ext = fileName.split(".").pop()?.toLowerCase();
  try {
    if (ext === "txt") return await file.text();
    if (ext === "docx") return await extractDocxText(file);
    if (ext === "pdf") return await extractPdfText(file);
  } catch (err) {
    console.warn(`Text extraction failed for ${fileName}:`, err);
  }
  return null;
}
