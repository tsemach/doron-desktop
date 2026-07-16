import React, { useEffect, useRef } from "react";

interface DocumentPlaceholderPreviewProps {
  html: string;
  fields: string[];
  fieldValues: Record<string, string>;
  focusedField: string | null;
  className?: string;
  style?: React.CSSProperties;
  onFieldClick?: (field: string) => void;
}

// Escapes text inserted into the injected HTML string (both attribute values and
// text content) \u2014 field names and user-entered values can contain arbitrary
// characters (colons, quotes, Hebrew text, etc.) per the `[[...]]` extraction
// regex, so this must run before anything goes into `dangerouslySetInnerHTML`.
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const DocumentPlaceholderPreview = React.memo(
  function DocumentPlaceholderPreview({
    html,
    fields,
    fieldValues,
    focusedField,
    className,
    style,
    onFieldClick,
  }: DocumentPlaceholderPreviewProps) {

  const containerRef = useRef<HTMLDivElement>(null);

  const isRtlText = (text: string | null | undefined): boolean => {
    if (!text) return false;
    const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF]/;
    return rtlRegex.test(text);
  };

  const renderHtmlWithValues = (htmlStr: string) => {
    if (!htmlStr) return "";
    let processedHtml = htmlStr;

    fields.forEach((field) => {
      const placeholder = `[[${field}]]`;
      const isFocused = field === focusedField;
      const userValue = fieldValues[field];
      const escapedField = escapeHtml(field);
      const fieldAttr = `data-field="${escapedField}"`;

      let replacement = "";
      if (userValue && userValue.trim() !== "") {
        const focusAttr = isFocused ? 'id="focused-field-preview-anchor"' : '';
        const focusClass = isFocused ? 'ring-2 ring-primary ring-offset-1 ring-offset-white' : '';
        replacement = `<span ${focusAttr} ${fieldAttr} class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 inline-block font-mono text-xs cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-shadow ${focusClass}" title="Filled: ${escapedField}">${escapeHtml(userValue)}</span>`;
      } else {
        const focusAttr = isFocused ? 'id="focused-field-preview-anchor"' : '';
        const highlightClass = isFocused
          ? "bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-500/40 inline-block animate-pulse text-xs ring-2 ring-amber-500 ring-offset-1 ring-offset-white cursor-pointer"
          : "bg-amber-50 text-amber-700 font-mono px-1 rounded border border-amber-500/20 border-dashed inline-block text-[11px] cursor-pointer hover:ring-2 hover:ring-amber-400 transition-shadow";
        replacement = `<span ${focusAttr} ${fieldAttr} class="${highlightClass}" title="Unfilled: ${escapedField}">[[${escapedField}]]</span>`;
      }

      processedHtml = processedHtml.split(placeholder).join(replacement);
    });

    return processedHtml;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onFieldClick) return;
    const target = e.target as HTMLElement;
    const fieldEl = target.closest("[data-field]");
    const field = fieldEl?.getAttribute("data-field");
    if (field) onFieldClick(field);
  };

  // Scroll focused field into view in the document preview page (scrolling container only)
  useEffect(() => {
    if (!focusedField || !html) return;

    const timer = setTimeout(() => {
      const anchor = document.getElementById("focused-field-preview-anchor");
      const container = containerRef.current;
      if (anchor && container) {
        const containerRect = container.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const scrollTopOffset = anchorRect.top - containerRect.top + container.scrollTop - (containerRect.height / 2);
        
        container.scrollTo({
          top: scrollTopOffset,
          behavior: "smooth"
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [focusedField, html]);

  return (
    <div
      ref={containerRef}
      className={className || "bg-background/80 dark:bg-background/20 p-3 rounded-lg border border-border/40 overflow-y-auto max-h-[300px] min-h-[220px] relative select-text"}
      style={style}
      onClick={handleClick}
    >
      <div 
        className="word-preview-page bg-white text-black p-6 sm:p-10 shadow-[0_4px_16px_rgba(0,0,0,0.06),_0_2px_4px_rgba(0,0,0,0.03)] border border-gray-100 mx-auto max-w-[800px] prose prose-sm max-w-none prose-headings:text-black prose-p:text-black text-xs sm:text-sm leading-relaxed font-serif"
        dir={isRtlText(html) ? "rtl" : "ltr"}
        dangerouslySetInnerHTML={{ __html: renderHtmlWithValues(html) }}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.html === nextProps.html &&
    prevProps.fields === nextProps.fields &&
    prevProps.fieldValues === nextProps.fieldValues &&
    prevProps.focusedField === nextProps.focusedField &&
    prevProps.className === nextProps.className &&
    prevProps.style?.height === nextProps.style?.height &&
    prevProps.onFieldClick === nextProps.onFieldClick
  );
});

export default DocumentPlaceholderPreview;
