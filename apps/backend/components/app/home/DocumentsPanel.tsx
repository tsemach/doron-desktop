"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutTemplate, Search } from "lucide-react";

// Matches desktop's AppHomeDocumentsPanel.tsx structure/classes. Desktop's
// "Scan & Index" is a per-folder action that doesn't have a global
// equivalent here -- backend's scanning happens per-case (Phase 4's
// Documents tab), so this links to Templates instead, the other action
// desktop's panel exposes.
export default function DocumentsPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      router.push(`/app/documents?q=${encodeURIComponent(query)}`);
    }
  }

  return (
    <div className="w-96 rounded-xl bg-card">
      <div className="px-4 py-2.5">
        <h3 className="text-sm font-semibold">Documents Management</h3>
      </div>
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <Link href="/app/cases/templates" className="flex items-center gap-2 px-4 py-2.5 hover:bg-accent/50 text-sm text-foreground">
        <LayoutTemplate className="size-4 text-muted-foreground" />
        Documents Templates
      </Link>
    </div>
  );
}
