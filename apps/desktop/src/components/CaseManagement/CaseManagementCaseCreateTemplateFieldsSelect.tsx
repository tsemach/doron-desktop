import { DocTemplate } from "./CaseManagementTypes";
import CaseManagementCaseCreateTemplateFieldsRows from "./CaseManagementCaseCreateTemplateFieldsRows";
import CaseManagementCaseCreateTemplateFieldsSearch from "./CaseManagementCaseCreateTemplateFieldsSearch";
import CaseManagementCaseCreateTemplateFieldsDocuments from "./CaseManagementCaseCreateTemplateFieldsDocuments";

interface CaseManagementCaseCreateTemplateFieldsSelectProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  uniqueRows: number[];
  selectedRow: number | null;
  onSelectedRowChange: (value: number | null) => void;
  filterDocId: number | null;
  onFilterDocIdChange: (value: number | null) => void;
  associatedDocs: DocTemplate[];
}

export default function CaseManagementCaseCreateTemplateFieldsSelect({
  searchQuery,
  onSearchQueryChange,
  uniqueRows,
  selectedRow,
  onSelectedRowChange,
  filterDocId,
  onFilterDocIdChange,
  associatedDocs,
}: CaseManagementCaseCreateTemplateFieldsSelectProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 mt-2 mb-2 shrink-0">
      <CaseManagementCaseCreateTemplateFieldsSearch
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      {uniqueRows.length > 0 && (
        <CaseManagementCaseCreateTemplateFieldsRows
          uniqueRows={uniqueRows}
          selectedRow={selectedRow}
          onSelectedRowChange={onSelectedRowChange}
        />
      )}

      {associatedDocs.length > 0 && (
        <CaseManagementCaseCreateTemplateFieldsDocuments
          filterDocId={filterDocId}
          onFilterDocIdChange={onFilterDocIdChange}
          associatedDocs={associatedDocs}
        />
      )}
    </div>
  );
}
