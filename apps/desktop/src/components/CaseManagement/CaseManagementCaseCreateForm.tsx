import { Button } from "@/components/ui/button";
import { CaseTemplate } from "./CaseManagementTypes";

interface CaseManagementCaseCreateFormProps {
  subject: string;
  onSubjectChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  folder: string;
  onFolderChange: (value: string) => void;
  onBrowse: () => void;
  templates: CaseTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (value: string) => void;
  loading: boolean;
}

export default function CaseManagementCaseCreateForm({
  subject,
  onSubjectChange,
  name,
  onNameChange,
  folder,
  onFolderChange,
  onBrowse,
  templates,
  selectedTemplateId,
  onTemplateChange,
  loading,
}: CaseManagementCaseCreateFormProps) {
  return (
    <>
      {/* Subject */}
      <div className="space-y-1">
        <label htmlFor="subject" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Subject
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="e.g. Eviction Notice, Acquisition Agreement"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          disabled={loading}
        />
      </div>

      {/* Customer Name */}
      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Customer Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. John Doe, Acme Corp"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          disabled={loading}
        />
      </div>

      {/* Folder Path */}
      <div className="space-y-1">
        <label htmlFor="folder" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Directory Path
        </label>
        <p className="text-xs text-muted-foreground">
          All templates and case files will reside in this directory.
        </p>
        <div className="flex gap-2">
          <input
            id="folder"
            type="text"
            value={folder}
            onChange={(e) => onFolderChange(e.target.value)}
            placeholder="Select or type folder path..."
            className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono"
            disabled={loading}
          />
          <Button type="button" variant="secondary" onClick={onBrowse} disabled={loading} className="px-5 py-3 h-auto">
            Browse...
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      <div className="space-y-1">
        <label htmlFor="template" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Template
        </label>
        <div className="relative">
          <select
            id="template"
            value={selectedTemplateId}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="w-full rounded-md border-0 bg-background pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring h-[46px] shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
            disabled={loading}
          >
            <option value="empty">Create Empty Case (No Documents)</option>
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-3.5 rtl:left-3.5 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
