interface OpenCasesFileIconProps {
  ext: string;
}

export default function OpenCasesFileIcon({ ext }: OpenCasesFileIconProps) {
  const normalized = ext.toLowerCase().replace(".", "");
  let bgColor = "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800";
  let symbol = "📄";
  let label = "FILE";

  if (normalized === "pdf") {
    bgColor = "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-900/50";
    symbol = "📕";
    label = "PDF";
  } else if (["docx", "doc"].includes(normalized)) {
    bgColor = "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-900/50";
    symbol = "📘";
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

  return (
    <div className={`w-10 h-10 shrink-0 rounded-lg border ${bgColor} flex flex-col items-center justify-center text-[10px] font-bold shadow-xs select-none`}>
      <span className="text-base leading-none">{symbol}</span>
      <span className="text-[7px] uppercase mt-0.5 tracking-wider font-semibold">{label}</span>
    </div>
  );
}
