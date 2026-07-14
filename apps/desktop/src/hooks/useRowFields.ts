import { useMemo } from "react";

export interface RowFieldsResult {
  uniqueRows: number[];
  rowToFieldsMap: Record<number | "none", string[]>;
  getFilteredFields: (
    selectedRow: number | null,
    searchQuery: string,
    additionalFilter?: (field: string) => boolean
  ) => string[];
}

export function useRowFields(fields: string[]): RowFieldsResult {
  const safeFields = useMemo(() => {
    return Array.isArray(fields) ? fields.filter((f) => typeof f === "string") : [];
  }, [fields]);

  // Pre-process and group fields by row number
  // Automatically updates the cache if the fields list is synchronized or updated.
  const parsed = useMemo(() => {
    const rowsSet = new Set<number>();
    const map: Record<number | "none", string[]> = {
      none: [],
    };

    safeFields.forEach((field) => {
      const match = field.match(/:([1-9])$/);
      if (match) {
        const rowNum = parseInt(match[1], 10);
        rowsSet.add(rowNum);
        if (!map[rowNum]) {
          map[rowNum] = [];
        }
        map[rowNum].push(field);
      } else {
        map.none.push(field);
      }
    });

    const uniqueRows = Array.from(rowsSet).sort((a, b) => a - b);
    return { uniqueRows, map };
  }, [safeFields]);

  const getFilteredFields = (
    selectedRow: number | null,
    searchQuery: string,
    additionalFilter?: (field: string) => boolean
  ): string[] => {
    // 1. Get candidate fields from pre-grouped map
    let candidates: string[];
    if (selectedRow === null) {
      candidates = safeFields;
    } else {
      candidates = parsed.map[selectedRow] || [];
    }

    // 2. Apply search query and any additional filter
    const query = searchQuery.trim().toLowerCase();

    return candidates.filter((field) => {
      if (query !== "" && !field.toLowerCase().includes(query)) {
        return false;
      }
      if (additionalFilter && !additionalFilter(field)) {
        return false;
      }
      return true;
    });
  };

  return {
    uniqueRows: parsed.uniqueRows,
    rowToFieldsMap: parsed.map,
    getFilteredFields,
  };
}
