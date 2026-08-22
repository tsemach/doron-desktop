// Matches desktop's CaseStatusBadge.tsx color scheme (open=zinc,
// waiting=yellow, closed=gray) -- kept local rather than added to
// packages/ui since desktop's version pulls translated labels via
// useLanguage() internally; this version takes the label as-is (backend
// doesn't need translation parity on raw DB status strings the way
// desktop's fixed enum does).
const STATUS_CLASSES: Record<string, string> = {
  open: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  waiting: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function CaseStatusBadge({ status }: { status: string }) {
  const classes = STATUS_CLASSES[status] ?? STATUS_CLASSES.open;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes}`}>{status}</span>;
}
