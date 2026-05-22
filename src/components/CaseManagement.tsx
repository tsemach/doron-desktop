import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

type CaseStatus = "open" | "in-progress" | "closed";

interface Case {
  id: string;
  title: string;
  status: CaseStatus;
  assignee: string;
  createdAt: string;
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  "in-progress": "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-100 text-gray-500",
};

const MOCK_CASES: Case[] = [
  { id: "CASE-001", title: "Contract dispute review", status: "open", assignee: "Alice", createdAt: "2026-05-20" },
  { id: "CASE-002", title: "Property transfer documents", status: "in-progress", assignee: "Bob", createdAt: "2026-05-18" },
  { id: "CASE-003", title: "Tenant eviction notice", status: "closed", assignee: "Alice", createdAt: "2026-05-10" },
];

export default function CaseManagement() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>(MOCK_CASES);
  const [filter, setFilter] = useState<CaseStatus | "all">("all");

  const filtered = filter === "all" ? cases : cases.filter((c) => c.status === filter);

  function closeCase(id: string) {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "closed" } : c))
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="mb-4 flex items-center gap-1"
      >
        ← Back
      </Button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Case Management</h1>
        <span className="text-sm text-muted-foreground">{cases.length} total cases</span>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "open", "in-progress", "closed"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
            className=""
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Assignee</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={c.id}
                className={`border-t border-border ${i % 2 === 0 ? "bg-background" : "bg-muted/30"}`}
              >
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.id}</td>
                <td className="px-4 py-3 font-medium">{c.title}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">{c.assignee}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.createdAt}</td>
                <td className="px-4 py-3 text-right">
                  {c.status !== "closed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => closeCase(c.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No cases found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
