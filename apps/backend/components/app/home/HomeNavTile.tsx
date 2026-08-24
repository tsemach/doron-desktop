import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Matches desktop's AppHome.tsx NAV_TILE_CLASS exactly.
const NAV_TILE_CLASS =
  "relative size-48 shrink-0 rounded-2xl border border-border bg-muted/40 hover:bg-accent hover:border-foreground/25 shadow-sm transition-colors flex items-center justify-center text-foreground/70 hover:text-foreground";

export default function HomeNavTile({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className={NAV_TILE_CLASS}>
      <div className="flex flex-col items-center gap-2">
        <Icon className="size-8" />
        <span className="text-2xl font-medium text-foreground/80">{label}</span>
      </div>
    </Link>
  );
}
