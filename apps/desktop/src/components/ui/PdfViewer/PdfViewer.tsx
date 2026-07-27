import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { PDF_CMAP_URL, PDF_STANDARD_FONTS_URL } from "./pdfjsSetup";
import PdfViewerToolbar from "./PdfViewerToolbar";
import { Button } from "@/components/ui/button";
import FileTypeIcon from "@/components/ui/FileTypeIcon";
import { useLanguage } from "../../../context/LanguageContext";

interface PdfViewerProps {
  filePath: string;
  onOpenExternal?: () => void;
  className?: string;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const DEFAULT_SCALE = 1.5;

export default function PdfViewer({ filePath, onOpenExternal, className }: PdfViewerProps) {
  const { t } = useLanguage();
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);

  const documentOptions = useMemo(
    () => ({ cMapUrl: PDF_CMAP_URL, cMapPacked: true, standardFontDataUrl: PDF_STANDARD_FONTS_URL }),
    []
  );

  // react-pdf reloads the document whenever the `file` prop's identity changes, so this must stay
  // stable across re-renders (e.g. page/zoom changes) — an inline `{ data: fileData }` literal would
  // be a new object every render, triggering a reload with an already-transferred (detached) buffer.
  const documentFile = useMemo(() => (fileData ? { data: fileData } : null), [fileData]);

  useEffect(() => {
    let active = true;

    async function loadFile() {
      setLoading(true);
      setLoadError(null);
      setFileData(null);
      setNumPages(0);
      setPageNumber(1);
      setScale(DEFAULT_SCALE);

      try {
        const bytes = await invoke<number[]>("read_file_bytes", { path: filePath });
        if (!active) return;
        setFileData(new Uint8Array(bytes));
      } catch (err) {
        if (!active) return;
        console.error("Failed to read PDF file:", err);
        setLoadError(String(err));
        setLoading(false);
      }
    }

    loadFile();

    return () => {
      active = false;
    };
  }, [filePath]);

  function handleDocumentLoadSuccess({ numPages: total }: { numPages: number }) {
    setNumPages(total);
    setLoading(false);
  }

  function handleDocumentLoadError(err: Error) {
    console.error("Failed to render PDF:", err);
    setLoadError(err.message);
    setLoading(false);
  }

  if (loadError) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <FileTypeIcon ext="pdf" />
        <p className="text-sm font-semibold text-foreground mt-4">{t("preview_unavailable")}</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-[320px]">{loadError}</p>
        {onOpenExternal && (
          <Button variant="outline" size="sm" onClick={onOpenExternal} className="mt-4 gap-1.5">
            {t("open_external_app")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ""}`}>
      {!loading && numPages > 0 && (
        <PdfViewerToolbar
          pageNumber={pageNumber}
          numPages={numPages}
          scale={scale}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          onPageChange={(page) => setPageNumber(Math.min(Math.max(page, 1), numPages))}
          onZoomChange={setScale}
        />
      )}

      <div className="flex-grow overflow-auto flex justify-center bg-muted/20 py-6">
        {loading && (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
            <div className="animate-spin text-3xl font-bold mb-2">⟳</div>
            <p className="text-sm">{t("converting_preview")}</p>
          </div>
        )}

        {documentFile && (
          <Document
            file={documentFile}
            options={documentOptions}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={null}
            error={null}
            className={loading ? "hidden" : undefined}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderAnnotationLayer
              renderTextLayer
              className="shadow-md"
            />
          </Document>
        )}
      </div>
    </div>
  );
}
