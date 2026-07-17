interface OpenCasesCaseAnnotationsFollowupDateProps {
  value?: string;
  onChange: (date: string) => void;
}

export default function OpenCasesCaseAnnotationsFollowupDate({
  value,
  onChange,
}: OpenCasesCaseAnnotationsFollowupDateProps) {
  return (
    <div className="space-y-2 shrink-0 animate-in slide-in-from-top-2 duration-200 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <span>📅 Follow-up Date</span>
        <span className="text-[10px] text-muted-foreground font-normal">(Case status will show as due/overdue on this date)</span>
      </label>
      <input
        type="date"
        value={value || ""}
        onChange={(e) => {
          onChange(e.target.value);
          if (e.target.value && e.target.value.length === 10) {
            e.target.blur();
          }
        }}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground cursor-pointer"
      />
    </div>
  );
}
