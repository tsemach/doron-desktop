"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CaseSummary } from "../../../lib/dashboard/types";
import CaseRow from "@/components/app/dashboard/CaseRow";

type CaseGroupProps = {
  title: string;
  cases: CaseSummary[];
};

const COLLAPSED_VISIBLE_COUNT = 3;
// Approximate height of 3 CaseRows (each ~56px with its px-4 py-3 padding
// and two lines of text) -- just needs to visually cut off around the
// 3rd row, not be pixel-exact, since this is mocked content.
const COLLAPSED_MAX_HEIGHT = "168px";

export default function CaseGroup({ title, cases }: CaseGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = cases.length > COLLAPSED_VISIBLE_COUNT;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasOverflow && setExpanded((prev) => !prev)}
        disabled={!hasOverflow}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left disabled:cursor-default"
      >
        {hasOverflow ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="font-heading text-xs font-bold uppercase tracking-wide text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">({cases.length})</span>
      </button>

      {cases.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No cases</p>
      ) : (
        <div className="relative">
          <ul
            className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
            style={{ maxHeight: !hasOverflow || expanded ? "2000px" : COLLAPSED_MAX_HEIGHT }}
          >
            {cases.map((caseItem) => (
              <CaseRow key={caseItem.id} caseItem={caseItem} />
            ))}
          </ul>
          {hasOverflow && (
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent transition-opacity duration-300 ${
                expanded ? "opacity-0" : "opacity-100"
              }`}
            />
          )}
        </div>
      )}
    </div>
  );
}
