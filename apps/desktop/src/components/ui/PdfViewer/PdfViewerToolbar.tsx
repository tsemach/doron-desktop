import { useLanguage } from "../../../context/LanguageContext";

interface PdfViewerToolbarProps {
  pageNumber: number;
  numPages: number;
  scale: number;
  minScale: number;
  maxScale: number;
  onPageChange: (page: number) => void;
  onZoomChange: (scale: number) => void;
}

const ZOOM_STEP = 0.2;

export default function PdfViewerToolbar({
  pageNumber,
  numPages,
  scale,
  minScale,
  maxScale,
  onPageChange,
  onZoomChange,
}: PdfViewerToolbarProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-muted/30 px-3 py-2 shrink-0">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(pageNumber - 1)}
          disabled={pageNumber <= 1}
          className="size-7 flex items-center justify-center rounded-md border border-border/80 text-foreground/70 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t("pdf_previous_page")}
        >
          ‹
        </button>
        <span className="text-xs text-muted-foreground tabular-nums select-none min-w-[72px] text-center">
          {t("pdf_page_of").replace("{current}", String(pageNumber)).replace("{total}", String(numPages))}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(pageNumber + 1)}
          disabled={pageNumber >= numPages}
          className="size-7 flex items-center justify-center rounded-md border border-border/80 text-foreground/70 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t("pdf_next_page")}
        >
          ›
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onZoomChange(Math.max(minScale, +(scale - ZOOM_STEP).toFixed(2)))}
          disabled={scale <= minScale}
          className="size-7 flex items-center justify-center rounded-md border border-border/80 text-foreground/70 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t("pdf_zoom_out")}
        >
          −
        </button>
        <span className="text-xs text-muted-foreground tabular-nums select-none min-w-[42px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onZoomChange(Math.min(maxScale, +(scale + ZOOM_STEP).toFixed(2)))}
          disabled={scale >= maxScale}
          className="size-7 flex items-center justify-center rounded-md border border-border/80 text-foreground/70 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={t("pdf_zoom_in")}
        >
          +
        </button>
      </div>
    </div>
  );
}
