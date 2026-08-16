import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface OpenCasesTagFilter {
  name: string;
  value: string;
}

interface OpenCasesTagSearchBarProps {
  freeText: string;
  onFreeTextChange: (value: string) => void;
  tagFilter: OpenCasesTagFilter | null;
  onTagFilterChange: (filter: OpenCasesTagFilter | null) => void;
}

/**
 * Parses a raw "#name", "#name:", "#name value", "#name: value" query into its
 * tag-name and (once a separator is typed) tag-value-narrowing parts. Returns
 * null when `raw` isn't a "#" query at all, so the caller falls back to plain
 * free-text search.
 */
function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded border border-border/70 bg-muted/70 font-mono text-[9px] font-semibold text-muted-foreground/90 leading-none">
      {children}
    </kbd>
  );
}

function SuggestionsFooter() {
  return (
    <div className="flex items-center gap-3 px-2.5 pt-1.5 mt-1 border-t border-border/60">
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <KeyHint>↑</KeyHint>
        <KeyHint>↓</KeyHint>
        navigate
      </span>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <KeyHint>↵</KeyHint>
        select
      </span>
    </div>
  );
}

function parseHashQuery(raw: string): { name: string; rest: string | null } | null {
  if (!raw.startsWith("#")) return null;
  const withoutHash = raw.slice(1);
  const sepIndex = withoutHash.search(/[:\s]/);
  if (sepIndex === -1) return { name: withoutHash, rest: null };
  const name = withoutHash.slice(0, sepIndex);
  const rest = withoutHash.slice(sepIndex + 1).replace(/^:?\s*/, "");
  return { name, rest };
}

export default function OpenCasesTagSearchBar({
  freeText,
  onFreeTextChange,
  tagFilter,
  onTagFilterChange,
}: OpenCasesTagSearchBarProps) {
  const [rawInput, setRawInput] = useState("");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const freeTextInputRef = useRef<HTMLInputElement>(null);

  // A tag filter is picked from a completely different input than the free-text
  // one it replaces — React mounts a fresh DOM node, so focus has to be restored
  // explicitly or the user's next keystrokes go nowhere.
  useEffect(() => {
    if (tagFilter) freeTextInputRef.current?.focus();
  }, [tagFilter]);

  useEffect(() => {
    invoke<string[]>("list_all_tag_names", { tagType: "user" })
      .then(setTagNames)
      .catch(() => setTagNames([]));
  }, []);

  const parsed = parseHashQuery(rawInput);
  const isPickingName = parsed !== null && parsed.rest === null;
  const isPickingValue = parsed !== null && parsed.rest !== null;

  useEffect(() => {
    if (!isPickingValue || !parsed) return;
    invoke<string[]>("list_tag_values", { name: parsed.name.toLowerCase() })
      .then(setTagValues)
      .catch(() => setTagValues([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPickingValue, parsed?.name]);

  function handleRawInputChange(value: string) {
    setRawInput(value);
    setHighlightedIndex(0);
    if (!value.startsWith("#")) {
      onFreeTextChange(value);
    }
  }

  function selectTagName(name: string) {
    setRawInput(`#${name}: `);
    setHighlightedIndex(0);
  }

  function selectTagValue(value: string) {
    onTagFilterChange({ name: parsed!.name.toLowerCase(), value });
    setRawInput("");
    setHighlightedIndex(0);
  }

  function clearTagFilter() {
    onTagFilterChange(null);
  }

  const nameSuggestions = isPickingName
    ? tagNames.filter((n) => n.toLowerCase().includes(parsed!.name.toLowerCase())).slice(0, 8)
    : [];
  const valueSuggestions = isPickingValue
    ? tagValues.filter((v) => v.toLowerCase().includes((parsed!.rest || "").toLowerCase())).slice(0, 8)
    : [];
  const activeSuggestions = isPickingName ? nameSuggestions : isPickingValue ? valueSuggestions : [];
  const clampedHighlight = activeSuggestions.length > 0 ? Math.min(highlightedIndex, activeSuggestions.length - 1) : -1;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (activeSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((clampedHighlight + 1) % activeSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((clampedHighlight - 1 + activeSuggestions.length) % activeSuggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = activeSuggestions[clampedHighlight];
      if (!picked) return;
      if (isPickingName) selectTagName(picked);
      else selectTagValue(picked);
    } else if (e.key === "Escape") {
      setRawInput("");
      setHighlightedIndex(0);
    }
  }

  if (tagFilter) {
    return (
      <div className="relative flex items-center gap-1.5 w-full sm:w-96 rounded-md border border-input bg-background pl-2 pr-2 py-1">
        <span className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
          #{tagFilter.name}: {tagFilter.value}
          <button type="button" onClick={clearTagFilter} className="hover:text-destructive">
            <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </span>
        <input
          ref={freeTextInputRef}
          type="text"
          value={freeText}
          onChange={(e) => onFreeTextChange(e.target.value)}
          placeholder="Search within this organization..."
          className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="relative w-full sm:w-80">
      <input
        type="text"
        value={rawInput}
        onChange={(e) => handleRawInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search cases by subject, customer, folder, fields... (# to filter by tag)"
        className="w-full rounded-md border border-input bg-background pl-3 pr-8 py-1.5 text-sm placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
      />
      {rawInput && (
        <button
          type="button"
          onClick={() => handleRawInputChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-sm"
          title="Clear search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}

      {isPickingName && nameSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-border bg-popover shadow-lg shadow-black/[0.06] animate-in fade-in slide-in-from-top-1 duration-150 p-1.5">
          {nameSuggestions.map((n, i) => {
            const active = i === clampedHighlight;
            return (
              <button
                key={n}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectTagName(n)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`group flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 text-left transition-colors duration-100 ${
                  active ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 shrink-0 rounded-md font-mono text-[11px] font-bold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground/80 group-hover:text-foreground"
                  }`}
                >
                  #
                </span>
                <span className={`text-sm font-medium truncate ${active ? "text-primary" : "text-foreground"}`}>
                  {n}
                </span>
              </button>
            );
          })}
          <SuggestionsFooter />
        </div>
      )}

      {isPickingValue && valueSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-border bg-popover shadow-lg shadow-black/[0.06] animate-in fade-in slide-in-from-top-1 duration-150 p-1.5">
          {valueSuggestions.map((v, i) => {
            const active = i === clampedHighlight;
            return (
              <button
                key={v}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectTagValue(v)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`group flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 text-left transition-colors duration-100 ${
                  active ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 shrink-0 rounded-full transition-colors ${
                    active ? "bg-primary" : "bg-muted-foreground/40 group-hover:bg-muted-foreground/70"
                  }`}
                />
                <span className={`text-sm font-medium truncate ${active ? "text-primary" : "text-foreground"}`}>
                  {v}
                </span>
              </button>
            );
          })}
          <SuggestionsFooter />
        </div>
      )}
    </div>
  );
}
