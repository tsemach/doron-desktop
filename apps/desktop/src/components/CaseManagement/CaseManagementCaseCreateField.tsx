interface CaseManagementCaseCreateFieldProps {
  field: string;
  value: string;
  isSelected: boolean;
  isFilled: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
}

export default function CaseManagementCaseCreateField({
  field,
  value,
  isSelected,
  isFilled,
  disabled,
  onChange,
  onFocus,
}: CaseManagementCaseCreateFieldProps) {
  return (
    <div className="space-y-0.5">
      <label
        htmlFor={`field-${field}`}
        className={`text-xs font-mono font-bold truncate block transition-all w-fit max-w-full ${
          isSelected
            ? isFilled
              ? "text-white bg-emerald-500 px-2 py-0.5 rounded-md shadow-sm shadow-emerald-500/40"
              : "text-white bg-amber-500 px-2 py-0.5 rounded-md shadow-sm shadow-amber-500/40 animate-pulse"
            : "text-muted-foreground font-medium"
        }`}
        title={field}
      >
        {field}
      </label>
      <input
        id={`field-${field}`}
        type="text"
        placeholder={`Value...`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className={`w-full rounded-md border px-4 py-2.5 text-sm focus:outline-none transition-all font-mono ${
          isSelected
            ? isFilled
              ? "border-emerald-500/60 ring-2 ring-emerald-400"
              : "border-amber-500/60 ring-2 ring-amber-400"
            : "border-input bg-background focus:ring-2 focus:ring-ring"
        }`}
        disabled={disabled}
      />
    </div>
  );
}
