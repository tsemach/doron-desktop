interface ScanFileCountProps {
  current: number;
  total: number;
  className?: string;
  prefix?: string;
}

export default function ScanFileCount({
  current,
  total,
  className = "shrink-0 text-xs font-mono font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20",
  prefix = "Files: ",
}: ScanFileCountProps) {
  return (
    <span className={className}>
      {prefix}{current} / {total}
    </span>
  );
}
