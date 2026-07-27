import { pdfjs } from "react-pdf";
// Vite bundles the worker as a local asset (via `?url`) so it loads offline —
// pdf.js otherwise defaults to fetching it from a CDN, which the desktop app has no access to.
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

// Copied from pdfjs-dist into public/pdfjs (see apps/desktop/public/pdfjs) so glyph/cmap
// data for non-embedded fonts (e.g. Hebrew PDFs) resolves locally instead of over the network.
export const PDF_CMAP_URL = "/pdfjs/cmaps/";
export const PDF_STANDARD_FONTS_URL = "/pdfjs/standard_fonts/";
