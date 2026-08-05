export default function TaskTemplateEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground space-y-4 py-20">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-base font-semibold text-foreground">Select a Task Template</h3>
        <p className="text-sm max-w-sm">
          Select a task template from the list on the left to see its tasks, or create a new one to auto-attach tasks to future cases.
        </p>
      </div>
    </div>
  );
}
