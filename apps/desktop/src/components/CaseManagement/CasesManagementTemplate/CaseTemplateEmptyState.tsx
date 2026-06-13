export default function CaseTemplateEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground space-y-4 py-20">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M7 8h10" />
          <path d="M7 12h10" />
          <path d="M7 16h10" />
        </svg>
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-base font-semibold text-foreground">Select a Case Template</h3>
        <p className="text-sm max-w-sm">
          Select a case template from the list on the left to see its associated document templates and dynamic variables.
        </p>
      </div>
    </div>
  );
}
