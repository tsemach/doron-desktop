"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

type DashboardCardProps = {
  // A rendered icon element, not a component reference -- this card is a
  // Client Component, and Server Component callers can only pass already-
  // rendered elements (not raw function/component values) across that
  // boundary.
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
  // Which of the 3 card columns (of the parent's 4-column grid: Open
  // Activities + 3 cards) this card naturally sits in. Needed as an
  // explicit grid-column-start so it stays in place -- and, when a sibling
  // expands over it -- rather than being auto-placed onto a new row, which
  // is what CSS grid auto-placement does once its normal slot is occupied
  // by an explicitly-positioned (expanded) sibling.
  column: 1 | 2 | 3;
};

// Literal class names (not template strings) so Tailwind's content scanner
// picks them up.
const COLUMN_START_CLASS: Record<1 | 2 | 3, string> = {
  1: "lg:col-start-2",
  2: "lg:col-start-3",
  3: "lg:col-start-4",
};

// Comfortably above the tallest mocked card's natural content height, so it
// never clips anything at rest; the expand transition animates up from here.
const COLLAPSED_MAX_HEIGHT = "max-h-[420px]";
const EXPANDED_MAX_HEIGHT = "max-h-[2000px]";

// Clicking the header expands the card over the other two glance cards: it
// spans all 3 card columns of the parent grid (covering its neighbors, which
// stay mounted underneath, explicitly positioned so the grid lets them
// overlap instead of auto-flowing to a new row) and grows to the row's full
// height, matching whichever sibling is tallest (the Open Activities panel)
// via the grid's default item-stretch behavior -- no height measurement
// needed. Collapsed cards opt out of stretch with `self-start` so they keep
// their natural content height instead.
//
// The grow-open animates smoothly by transitioning max-height (the same
// technique CaseGroup uses for its collapsible rows) from a generous cap up
// to another generous cap -- the real ceiling stays the grid stretch target,
// so it still settles at exactly the right height with no measurement.
// grid-column (the width/cover-reveal) can't be animated the same way --
// it's a discrete layout property -- so that still snaps instantly, in both
// directions; closing likewise snaps, since animating it back down to a
// content-driven "auto" height isn't something CSS can interpolate.
export default function DashboardCard({ icon, title, count, children, column }: DashboardCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`relative w-full rounded-2xl bg-card shadow-2xl overflow-hidden lg:row-start-1 lg:w-auto transition-[max-height] duration-300 ease-in-out ${
        expanded ? EXPANDED_MAX_HEIGHT : COLLAPSED_MAX_HEIGHT
      } ${
        expanded
          ? "z-20 lg:col-start-2 lg:col-span-3"
          : `self-start ${COLUMN_START_CLASS[column]}`
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 border-b border-border px-4 py-3 text-left"
      >
        {icon}
        <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
        <div className="ml-auto flex items-center gap-1.5">
          {typeof count === "number" && (
            <span className="text-xs font-medium text-muted-foreground">{count}</span>
          )}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
      </button>
      <div className="p-4">{children}</div>
    </div>
  );
}
