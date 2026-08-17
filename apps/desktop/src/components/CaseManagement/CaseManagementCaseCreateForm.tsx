import { Button } from "@/components/ui/button";
import { CaseTemplate } from "./CaseManagementTypes";
import { TaskTemplate } from "@/lib/task/types";
import CaseManagementOrganizationField from "./CaseManagementOrganizationField";
import { EMPTY_TEMPLATE_ID } from "@/reducers/case-create.reducer";
import { CASE_TYPE_OPTIONS } from "./caseTypeOptions";
import { useLanguage } from "@/context/LanguageContext";

interface CaseManagementCaseCreateFormProps {
  subject: string;
  onSubjectChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  organization: string;
  onOrganizationChange: (value: string) => void;
  caseType: string;
  onCaseTypeChange: (value: string) => void;
  folder: string;
  onFolderChange: (value: string) => void;
  onBrowse: () => void;
  templates: CaseTemplate[];
  selectedTemplateId: string;
  onTemplateChange: (value: string) => void;
  taskTemplates: TaskTemplate[];
  selectedTaskTemplateId: string;
  onTaskTemplateChange: (value: string) => void;
  loading: boolean;
  templateHelpOpen: boolean;
  onToggleTemplateHelp: () => void;
}

export default function CaseManagementCaseCreateForm({
  subject,
  onSubjectChange,
  name,
  onNameChange,
  organization,
  onOrganizationChange,
  caseType,
  onCaseTypeChange,
  folder,
  onFolderChange,
  onBrowse,
  templates,
  selectedTemplateId,
  onTemplateChange,
  taskTemplates,
  selectedTaskTemplateId,
  onTaskTemplateChange,
  loading,
  templateHelpOpen,
  onToggleTemplateHelp,
}: CaseManagementCaseCreateFormProps) {
  const { t } = useLanguage();

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
          className="w-full rounded-md border border-input bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all h-[36px]"
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
          className="w-full rounded-md border border-input bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all h-[36px]"
          disabled={loading}
        />
      </div>

      {/* Organization (optional) */}
      <div className="space-y-1">
        <label htmlFor="organization" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Organization
        </label>
        <CaseManagementOrganizationField
          value={organization}
          onChange={onOrganizationChange}
          placeholder="e.g. Acme Corp (optional)"
          disabled={loading}
          className="w-full rounded-md border border-input bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all h-[36px]"
        />
      </div>

      {/* Case Type (optional) */}
      <div className="space-y-1">
        <label htmlFor="caseType" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t("case_type_label")}
        </label>
        <div className="relative">
          <select
            id="caseType"
            value={caseType}
            onChange={(e) => onCaseTypeChange(e.target.value)}
            className="w-full rounded-md border-0 bg-background pl-3.5 pr-10 rtl:pr-3.5 rtl:pl-10 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring h-[36px] shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
            disabled={loading}
          >
            <option value="">{t("case_type_select_placeholder")}</option>
            {CASE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
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
            className="flex-1 rounded-md border border-input bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono h-[36px]"
            disabled={loading}
          />
          <Button type="button" variant="secondary" onClick={onBrowse} disabled={loading} className="px-4 py-1.5 h-[36px]">
            Browse...
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      <div className="space-y-1">
        <label htmlFor="template" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          Case Template
          <button
            type="button"
            onClick={onToggleTemplateHelp}
            className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
              templateHelpOpen ? "text-foreground bg-muted" : ""
            }`}
            title="Case Template Help"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </label>
        <div className="relative">
          <select
            id="template"
            value={selectedTemplateId}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="w-full rounded-md border-0 bg-background pl-3.5 pr-10 rtl:pr-3.5 rtl:pl-10 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring h-[36px] shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
            disabled={loading}
          >
            <option value={EMPTY_TEMPLATE_ID}>Create Empty Case (No Documents)</option>
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

      {/* Task Template Selector */}
      <div className="space-y-1">
        <label htmlFor="taskTemplate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Task Template
        </label>
        <div className="relative">
          <select
            id="taskTemplate"
            value={selectedTaskTemplateId}
            onChange={(e) => onTaskTemplateChange(e.target.value)}
            className="w-full rounded-md border-0 bg-background pl-3.5 pr-10 rtl:pr-3.5 rtl:pl-10 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring h-[36px] shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
            disabled={loading}
          >
            <option value={EMPTY_TEMPLATE_ID}>Create Empty Case (No Tasks)</option>
            {taskTemplates.map((t) => (
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
