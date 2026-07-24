interface FileTypeIconProps {
  ext: string;
  size?: "default" | "sm";
}

export default function FileTypeIcon({ ext, size = "default" }: FileTypeIconProps) {
  const normalized = ext.toLowerCase().replace(".", "");
  let bgColor = "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800";
  let symbol = "📄";
  let label = "FILE";

  if (normalized === "pdf") {
    bgColor = "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-900/50";
    symbol = "📕";
    label = "PDF";
  } else if (["docx", "doc"].includes(normalized)) {
    bgColor = "bg-zinc-50 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800/50";
    symbol = "📓";
    label = "DOCX";
  } else if (["xlsx", "xls"].includes(normalized)) {
    bgColor = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50";
    symbol = "📗";
    label = "XLSX";
  } else if (normalized === "txt") {
    bgColor = "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900/50";
    symbol = "📝";
    label = "TXT";
  }

  const isSm = size === "sm";

  return (
    <div
      className={`shrink-0 rounded-lg border ${bgColor} flex flex-col items-center justify-center font-bold shadow-xs select-none ${
        isSm ? "w-7 h-7 text-[8px]" : "w-10 h-10 text-[10px]"
      }`}
    >
      <span className={isSm ? "text-sm leading-none" : "text-base leading-none"}>{symbol}</span>
      <span className={`uppercase tracking-wider font-semibold ${isSm ? "text-[6px] mt-px" : "text-[7px] mt-0.5"}`}>
        {label}
      </span>
    </div>
  );
}
