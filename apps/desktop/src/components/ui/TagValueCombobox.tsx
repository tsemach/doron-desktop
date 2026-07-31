import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TagValueComboboxProps {
  /** Tag name whose existing values populate the suggestion list (e.g. "company"). */
  tagName: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Fires when a value is picked from the list, or confirmed via Enter/blur. */
  onValueCommitted?: (value: string, isNew: boolean) => void;
}

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded border border-border/70 bg-muted/70 font-mono text-[9px] font-semibold text-muted-foreground/90 leading-none">
      {children}
    </kbd>
  );
}

export default function TagValueCombobox({
  tagName,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  onValueCommitted,
}: TagValueComboboxProps) {
  const [existingValues, setExistingValues] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string[]>("list_tag_values", { name: tagName })
      .then((values) => {
        if (!cancelled) setExistingValues(values);
      })
      .catch(() => {
        if (!cancelled) setExistingValues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tagName]);

  const trimmed = value.trim();
  const suggestions = trimmed
    ? existingValues.filter((v) => v.toLowerCase().includes(trimmed.toLowerCase()))
    : existingValues;
  const visibleSuggestions = suggestions.slice(0, 8);
  const clampedHighlight = visibleSuggestions.length > 0 ? Math.min(highlightedIndex, visibleSuggestions.length - 1) : -1;

  function commit(committedValue: string) {
    const v = committedValue.trim();
    if (!v) return;
    const existing = existingValues.find((ev) => ev.toLowerCase() === v.toLowerCase());
    onValueCommitted?.(existing ?? v, !existing);
  }

  function selectSuggestion(v: string) {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    onChange(v);
    setIsOpen(false);
    commit(v);
  }

  function handleBlur() {
    // Delay so a click on a dropdown option registers before the list closes.
    closeTimeout.current = setTimeout(() => {
      setIsOpen(false);
      commit(value);
    }, 150);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && isOpen && visibleSuggestions.length > 0) {
      e.preventDefault();
      setHighlightedIndex((clampedHighlight + 1) % visibleSuggestions.length);
    } else if (e.key === "ArrowUp" && isOpen && visibleSuggestions.length > 0) {
      e.preventDefault();
      setHighlightedIndex((clampedHighlight - 1 + visibleSuggestions.length) % visibleSuggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && clampedHighlight >= 0) {
        selectSuggestion(visibleSuggestions[clampedHighlight]);
      } else {
        setIsOpen(false);
        commit(value);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={
          className ??
          "w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
        }
      />
      {isOpen && visibleSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1.5 w-full max-h-64 overflow-auto rounded-xl border border-border bg-popover shadow-lg shadow-black/[0.06] animate-in fade-in slide-in-from-top-1 duration-150 p-1.5">
          {visibleSuggestions.map((v, i) => {
            const active = i === clampedHighlight;
            return (
              <button
                key={v}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(v)}
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
        </div>
      )}
    </div>
  );
}
