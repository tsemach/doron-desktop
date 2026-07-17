import { DocTemplate } from "./CaseManagementTypes";

interface CaseManagementCaseCreateTemplateFieldsDocumentsProps {
  filterDocId: number | null;
  onFilterDocIdChange: (value: number | null) => void;
  associatedDocs: DocTemplate[];
}

export default function CaseManagementCaseCreateTemplateFieldsDocuments({
  filterDocId,
  onFilterDocIdChange,
  associatedDocs,
}: CaseManagementCaseCreateTemplateFieldsDocumentsProps) {
  return (
    <div className="relative w-full sm:w-[220px]">
      <select
        value={filterDocId ?? "all"}
        onChange={(e) => onFilterDocIdChange(e.target.value === "all" ? null : Number(e.target.value))}
        className="rounded-md border-0 bg-background pl-3 pr-8 rtl:pr-3 rtl:pl-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring h-[34px] w-full shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
      >
        <option value="all">All Documents ({associatedDocs.length})</option>
        {associatedDocs.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {doc.title || doc.file_name}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-2.5 rtl:left-2.5 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
