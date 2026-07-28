import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { TagFilter } from "@/lib/search";

import { Button } from "../../ui/button";
import type { DocumentSearchAdvancedFilters, DocumentSearchTarget } from "./types";

const DOC_TYPES = [
  "contract",
  "report",
  "invoice",
  "memo",
  "specification",
  "presentation",
  "spreadsheet",
  "letter",
  "policy",
  "manual",
  "other",
];

type SearchAdvancedProps = {
  filters: DocumentSearchAdvancedFilters;
  onChange: (filters: DocumentSearchAdvancedFilters) => void;
};

export default function SearchAdvanced({
  filters,
  onChange,
}: SearchAdvancedProps) {
  const [availableTagNames, setAvailableTagNames] = useState<string[]>([]);
  const [newTagFilterName, setNewTagFilterName] = useState("");
  const [newTagFilterValue, setNewTagFilterValue] = useState("");

  const { docType, dateFrom, dateTo, tagFilters, notesContains, searchTarget } = filters;
  const hasStructuredFilters = tagFilters.length > 0 || !!notesContains.trim();

  useEffect(() => {
    invoke<string[]>("list_all_tag_names", { tagType: "user" }).then(setAvailableTagNames).catch(() => { });
  }, []);

  function updateFilters(patch: Partial<DocumentSearchAdvancedFilters>) {
    onChange({ ...filters, ...patch });
  }

  function handleClear() {
    onChange({
      ...filters,
      docType: "",
      dateFrom: "",
      dateTo: "",
      tagFilters: [],
      notesContains: "",
    });
    setNewTagFilterName("");
    setNewTagFilterValue("");
  }

  function handleAddTagFilter(name: string, value?: string) {
    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName || tagFilters.some((f) => f.name === trimmedName)) return;
    const next: TagFilter[] = [...tagFilters, { name: trimmedName, value: value?.trim() || undefined }];
    updateFilters({ tagFilters: next });
    setNewTagFilterName("");
    setNewTagFilterValue("");
  }

  function handleRemoveTagFilter(name: string) {
    updateFilters({ tagFilters: tagFilters.filter((f) => f.name !== name) });
  }

  function handleTagFilterKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTagFilter(newTagFilterName, newTagFilterValue);
    }
  }

  return (
    <div className="doc-search__advanced animate-fade-in-down">
      <div className="doc-search__field-row">
        <label className="doc-search__label">Search in:</label>
        <div className="doc-search__target-group">
          {(["documents", "cases", "both"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => updateFilters({ searchTarget: opt as DocumentSearchTarget })}
              className={[
                "doc-search__target-btn",
                opt !== "documents" ? "doc-search__target-btn--bordered" : "",
                searchTarget === opt ? "doc-search__target-btn--active" : "",
              ].filter(Boolean).join(" ")}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="doc-search__tags-row">
        <label className="doc-search__label doc-search__label--tags">Tags:</label>
        <div className="doc-search__tags-field">
          <div className="doc-search__tags-input-wrap">
            {tagFilters.map((f) => (
              <span key={f.name} className="doc-search__tag-chip">
                #{f.value ? `${f.name}: ${f.value}` : f.name}
                <button
                  type="button"
                  onClick={() => handleRemoveTagFilter(f.name)}
                  className="doc-search__tag-remove"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ))}
            <input
              type="text"
              list="doc-search-tag-suggestions"
              placeholder={tagFilters.length === 0 ? "e.g. important..." : ""}
              value={newTagFilterName}
              onChange={(e) => setNewTagFilterName(e.target.value)}
              onKeyDown={handleTagFilterKeyDown}
              className="doc-search__tag-text-input"
            />
            <datalist id="doc-search-tag-suggestions">
              {availableTagNames
                .filter((n) => !tagFilters.some((f) => f.name === n))
                .map((n) => (
                  <option key={n} value={n} />
                ))}
            </datalist>
          </div>

          {newTagFilterName.trim() && (
            <div className="doc-search__tag-value-row animate-in slide-in-from-top-1 duration-150">
              <input
                type="text"
                placeholder="Optional value..."
                value={newTagFilterValue}
                onChange={(e) => setNewTagFilterValue(e.target.value)}
                onKeyDown={handleTagFilterKeyDown}
                className="doc-search__text-input"
              />
              <Button
                type="button"
                size="sm"
                className="doc-search__add-btn"
                onClick={() => handleAddTagFilter(newTagFilterName, newTagFilterValue)}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="doc-search__field-row">
        <label className="doc-search__label">Notes contain:</label>
        <input
          type="text"
          value={notesContains}
          onChange={(e) => updateFilters({ notesContains: e.target.value })}
          placeholder="e.g. sign-off"
          className="doc-search__text-input doc-search__text-input--notes"
        />
      </div>

      <div className="doc-search__filters-row">
        <div className="doc-search__field-row">
          <label className="doc-search__label">Doc Type:</label>
          <select
            value={docType}
            onChange={(e) => updateFilters({ docType: e.target.value })}
            className="doc-search__select"
          >
            <option value="">Any</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="doc-search__field-row">
          <label className="doc-search__label">From:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateFilters({ dateFrom: e.target.value })}
            className="doc-search__date-input"
          />
        </div>

        <div className="doc-search__field-row">
          <label className="doc-search__label">To:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateFilters({ dateTo: e.target.value })}
            className="doc-search__date-input"
          />
        </div>
      </div>

      {(hasStructuredFilters || docType || dateFrom || dateTo) && (
        <button type="button" onClick={handleClear} className="doc-search__clear-btn">
          Clear Advance Search
        </button>
      )}
    </div>
  );
}
