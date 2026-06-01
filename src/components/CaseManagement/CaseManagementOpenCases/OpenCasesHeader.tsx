import { Button } from "@/components/ui/button";

interface OpenCasesHeaderProps {
  casesCount: number;
  onNewCase: () => void;
}

export default function OpenCasesHeader({
  casesCount,
  onNewCase,
}: OpenCasesHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 shrink-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Case Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track active cases, their statuses, and associated documents.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{casesCount} total cases</span>
        <Button onClick={onNewCase}>+ New Case</Button>
      </div>
    </div>
  );
}
