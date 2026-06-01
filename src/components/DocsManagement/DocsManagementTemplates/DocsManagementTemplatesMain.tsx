import { useState } from "react";
import { TemplateRow } from "./DocsManagementTemplates.types";
import DocsManagementTemplatesMainEmpty from "./DocsManagementTemplatesMainEmpty";
import DocsManagementTemplatesMainHeader from "./DocsManagementTemplatesMainHeader";
import DocsManagementTemplatesMainFull from "./DocsManagementTemplatesMainFull";
import DocsManagementTemplatesMainDoc from "./DocsManagementTemplatesMainDoc";

interface DocsManagementTemplatesEmptyStateProps {
  onAddTemplate: () => void;
  isProcessing: boolean;
  templates: TemplateRow[];
}

export default function DocsManagementTemplatesMain({
  onAddTemplate,
  isProcessing,
  templates,
}: DocsManagementTemplatesEmptyStateProps) {
  const [searchQuery, setSearchQuery] = useState("");
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
  const docFieldsList = templates.map((t) => {
    const fields = parseFields(t.fields_found);
    return {
      id: t.id,
      file_name: t.file_name,
      title: t.title,
      fields: fields.sort(),
    };
  });

  // Calculate unique fields dictionary
  const uniqueFieldsMap: Record<string, { count: number; docNames: string[] }> = {};
  docFieldsList.forEach(({ file_name, title, fields }) => {
    const displayName = title || file_name;
    fields.forEach((f) => {
      if (!uniqueFieldsMap[f]) {
        uniqueFieldsMap[f] = { count: 0, docNames: [] };
      }
      uniqueFieldsMap[f].count += 1;
      uniqueFieldsMap[f].docNames.push(displayName);
    });
  });

  const uniqueFieldsList = Object.keys(uniqueFieldsMap).sort();

  // Filters
  const filteredUniqueFields = uniqueFieldsList.filter((f) =>
    f.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDocFields = docFieldsList
    .map((doc) => {
      const matchingFields = doc.fields.filter((f) =>
        f.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const docMatches =
        doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.title && doc.title.toLowerCase().includes(searchQuery.toLowerCase()));

      if (docMatches || matchingFields.length > 0) {
        return {
          ...doc,
          fields: docMatches ? doc.fields : matchingFields,
        };
      }
      return null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

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
