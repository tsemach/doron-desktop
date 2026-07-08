import { useState, useMemo, useDeferredValue } from "react";
import { TemplateRow } from "./DocsManagementTemplates.types";
import DocsManagementTemplatesMainEmpty from "./DocsManagementTemplatesMainEmpty";
import DocsManagementTemplatesMainHeader from "./DocsManagementTemplatesMainHeader";
import DocsManagementTemplatesMainFull from "./DocsManagementTemplatesMainFull";
import DocsManagementTemplatesMainDoc from "./DocsManagementTemplatesMainDoc";

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

  // Filters (utilizing deferredSearchQuery to keep the UI input responsive)
  const filteredUniqueFields = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase().trim();
    return uniqueFieldsList.filter((f) =>
      f.toLowerCase().includes(query)
    );
  }, [uniqueFieldsList, deferredSearchQuery]);

  const filteredDocFields = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase().trim();
    return docFieldsList
      .map((doc) => {
        const matchingFields = doc.fields.filter((f) =>
          f.toLowerCase().includes(query)
        );
        const docMatches =
          doc.file_name.toLowerCase().includes(query) ||
          (doc.title && doc.title.toLowerCase().includes(query));

        if (docMatches || matchingFields.length > 0) {
          return {
            ...doc,
            fields: docMatches ? doc.fields : matchingFields,
          };
        }
        return null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [docFieldsList, deferredSearchQuery]);

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
