// Desktop repeats this exact markup verbatim in 3 places (OpenCasesHeader,
// DocsManagementHeader, CalendarHeader) -- zero data-fetching, trivially
// generic, so it's shared here instead of copy-pasted a 4th time in
// apps/backend. Same classes as desktop's copies, byte-for-byte.
export function BetaBadge() {
  return (
    <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider align-middle bg-red-50 text-red-600 border border-red-200">
      Beta
    </span>
  );
}
