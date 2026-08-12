import { Briefcase, CalendarClock, ListChecks, Mail, type LucideIcon } from "lucide-react";
import type { StatTileData } from "../../../lib/dashboard/types";

// Keys must match the `icon` values used in lib/dashboard/mockData.ts.
const ICONS: Record<string, LucideIcon> = { Mail, CalendarClock, Briefcase, ListChecks };

type StatTileProps = {
  tile: StatTileData;
};

export default function StatTile({ tile }: StatTileProps) {
  const Icon = ICONS[tile.icon];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{tile.primary.label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">
        {tile.primary.count}
        {tile.secondary && (
          <span className="ml-2 text-sm font-medium text-muted-foreground">
            · {tile.secondary.count} {tile.secondary.label}
          </span>
        )}
      </p>
    </div>
  );
}
