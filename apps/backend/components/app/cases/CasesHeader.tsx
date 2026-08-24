import { BetaBadge } from "@workspace/ui";
import NewCaseButton from "./NewCaseButton";

// Matches desktop's OpenCasesHeader.tsx structure/classes.
export default function CasesHeader({ totalCount }: { totalCount: number }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Case Management
          <BetaBadge />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Track active cases, their statuses, and associated documents.</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{totalCount} total cases</span>
        <NewCaseButton />
      </div>
    </div>
  );
}
