import React, { useEffect, useRef } from "react";

interface DocumentPlaceholderPreviewProps {
  html: string;
  fields: string[];
  fieldValues: Record<string, string>;
  focusedField: string | null;
  className?: string;
  style?: React.CSSProperties;
}

const DocumentPlaceholderPreview = React.memo(
  function DocumentPlaceholderPreview({
    html,
    fields,
    fieldValues,
    focusedField,
    className,
    style,
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

      let replacement = "";
      if (userValue && userValue.trim() !== "") {
        const focusAttr = isFocused ? 'id="focused-field-preview-anchor"' : '';
        const focusClass = isFocused ? 'ring-2 ring-primary ring-offset-1 ring-offset-white' : '';
        replacement = `<span ${focusAttr} class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 inline-block font-mono text-xs ${focusClass}" title="Filled: ${field}">${userValue}</span>`;
      } else {
        const focusAttr = isFocused ? 'id="focused-field-preview-anchor"' : '';
        const highlightClass = isFocused
          ? "bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-500/40 inline-block animate-pulse text-xs ring-2 ring-amber-500 ring-offset-1 ring-offset-white"
          : "bg-amber-50 text-amber-700 font-mono px-1 rounded border border-amber-500/20 border-dashed inline-block text-[11px]";
        replacement = `<span ${focusAttr} class="${highlightClass}" title="Unfilled: ${field}">[[${field}]]</span>`;
      }

      processedHtml = processedHtml.split(placeholder).join(replacement);
    });

    return processedHtml;
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
    prevProps.style?.height === nextProps.style?.height
  );
});

export default DocumentPlaceholderPreview;
