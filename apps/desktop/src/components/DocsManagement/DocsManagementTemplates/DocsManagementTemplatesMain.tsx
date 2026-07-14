import { useState, useMemo, useDeferredValue } from "react";
import { TemplateRow } from "./DocsManagementTemplates.types";
import DocsManagementTemplatesMainEmpty from "./DocsManagementTemplatesMainEmpty";
import DocsManagementTemplatesMainHeader from "./DocsManagementTemplatesMainHeader";
import DocsManagementTemplatesMainFull from "./DocsManagementTemplatesMainFull";
import DocsManagementTemplatesMainDoc from "./DocsManagementTemplatesMainDoc";
import { useRowFields } from "@/hooks/useRowFields";

interface DocsManagementTemplatesEmptyStateProps {
  onAddTemplate: () => void;
  isProcessing: boolean;
  templates: TemplateRow[];
  onSyncAllFields?: () => void;
  isSyncingAll?: boolean;
}

export default function DocsManagementTemplatesMain({
  onAddTemplate,
  isProcessing,
  templates,
  onSyncAllFields,
  isSyncingAll,
}: DocsManagementTemplatesEmptyStateProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"unique" | "by_doc">("unique");

  // Safe parsing helper
  const parseFields = (fieldsJson: string): string[] => {
    try {
      const parsed = JSON.parse(fieldsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Construct structured templates with fields list
  const docFieldsList = useMemo(() => {
    return templates.map((t) => {
      const fields = parseFields(t.fields_found);
      return {
        id: t.id,
        file_name: t.file_name,
        title: t.title,
        fields: fields.sort(),
      };
    });
  }, [templates]);

  // Calculate unique fields dictionary
  const uniqueFieldsMap = useMemo(() => {
    const map: Record<string, { count: number; docNames: string[] }> = {};
    docFieldsList.forEach(({ file_name, title, fields }) => {
      const displayName = title || file_name;
      fields.forEach((f) => {
        if (!map[f]) {
          map[f] = { count: 0, docNames: [] };
        }
        map[f].count += 1;
        map[f].docNames.push(displayName);
      });
    });
    return map;
  }, [docFieldsList]);

  const uniqueFieldsList = useMemo(() => {
    return Object.keys(uniqueFieldsMap).sort();
  }, [uniqueFieldsMap]);

  const { uniqueRows, getFilteredFields } = useRowFields(uniqueFieldsList);

  // Filters (utilizing deferredSearchQuery to keep the UI input responsive)
  const filteredUniqueFields = useMemo(() => {
    return getFilteredFields(selectedRow, deferredSearchQuery);
  }, [getFilteredFields, selectedRow, deferredSearchQuery]);

  const filteredDocFields = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase().trim();
    return docFieldsList
      .map((doc) => {
        const matchingFields = doc.fields.filter((f) => {
          const matchesQuery = query === "" || f.toLowerCase().includes(query);
          if (!matchesQuery) return false;
          
          if (selectedRow !== null) {
            const match = f.match(/:([1-9])$/);
            if (!match || parseInt(match[1], 10) !== selectedRow) {
              return false;
            }
          }
          return true;
        });

        const docMatches =
          query !== "" && (
            doc.file_name.toLowerCase().includes(query) ||
            (doc.title && doc.title.toLowerCase().includes(query))
          );

        if (docMatches || matchingFields.length > 0) {
          let fieldsToUse = doc.fields;
          if (selectedRow !== null) {
            fieldsToUse = doc.fields.filter((f) => {
              const match = f.match(/:([1-9])$/);
              return match && parseInt(match[1], 10) === selectedRow;
            });
          }
          
          if (fieldsToUse.length > 0) {
            return {
              ...doc,
              fields: docMatches && selectedRow === null ? doc.fields : fieldsToUse.filter((f) => query === "" || f.toLowerCase().includes(query)),
            };
          }
        }
        return null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [docFieldsList, deferredSearchQuery, selectedRow]);

  // If there are no templates, show the original centered empty state
  if (templates.length === 0) {
    return (
      <DocsManagementTemplatesMainEmpty
        onAddTemplate={onAddTemplate}
        isProcessing={isProcessing}
      />
    );
  }

  // Full-width Layout
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">

      <DocsManagementTemplatesMainHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        uniqueCount={filteredUniqueFields.length}
        docCount={filteredDocFields.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        uniqueRows={uniqueRows}
        selectedRow={selectedRow}
        setSelectedRow={setSelectedRow}
        onSyncAllFields={onSyncAllFields}
        isSyncingAll={isSyncingAll}
      />

      {/* Scrollable Dictionary Content */}
      <div className="flex-1 overflow-y-auto pt-8 px-4 pb-4 space-y-4">
        {activeTab === "unique" ? (
          <DocsManagementTemplatesMainFull
            filteredUniqueFields={filteredUniqueFields}
            uniqueFieldsMap={uniqueFieldsMap}
          />
        ) : (
          <DocsManagementTemplatesMainDoc
            filteredDocFields={filteredDocFields}
          />
        )}
      </div>

    </div>
  );
}
