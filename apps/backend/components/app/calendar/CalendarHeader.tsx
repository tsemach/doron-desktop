import { BetaBadge } from "@workspace/ui";

// Matches desktop's CalendarHeader.tsx structure/classes.
export default function CalendarHeader() {
  return (
    <div className="border-b border-border px-6 py-4">
      <h1 className="text-xl font-bold text-foreground">
        Calendar
        <BetaBadge />
      </h1>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">All meetings across every case</p>
    </div>
  );
}
