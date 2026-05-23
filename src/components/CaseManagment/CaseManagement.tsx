import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import CaseManagementSidebar from "./CaseManagmentSidebar";

type CaseStatus = "open" | "in-progress" | "closed";

interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  "in-progress": "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-100 text-gray-500",
};

const MOCK_CASES: Case[] = [
  { id: "CASE-001", subject: "Contract dispute review", status: "open", name: "Alice", createdAt: "2026-05-20" },
  { id: "CASE-002", subject: "Property transfer documents", status: "in-progress", name: "Bob", createdAt: "2026-05-18" },
  { id: "CASE-003", subject: "Tenant eviction notice", status: "closed", name: "Alice", createdAt: "2026-05-10" },
];

export default function CaseManagement() {
  const [cases, setCases] = useState<Case[]>(MOCK_CASES);
  const [filter, setFilter] = useState<CaseStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState<string>("");

  useEffect(() => {
    invoke<string>("get_db_path").then(setDbPath).catch(() => {});
  }, []);

  const filtered = filter === "all" ? cases : cases.filter((c) => c.status === filter);

  async function addDummyCase() {
    setError(null);
    try {
      const newCase = await invoke<{ id: number; subject: string; status: string; name: string; created_at: string; updated_at?: string }>(
        "add_case",
        {
          subject: "New dummy case",
          status: "open",
          name: "Alice",
          createdAt: new Date().toISOString().split("T")[0],
        }
      );
      setCases((prev) => [
        ...prev,
        {
          id: String(newCase.id),
          subject: newCase.subject,
          status: newCase.status as CaseStatus,
          name: newCase.name,
          createdAt: newCase.created_at,
          updatedAt: newCase.updated_at,
        },
      ]);
    } catch (err) {
      setError(String(err));
    }
  }

  function closeCase(id: string) {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "closed" } : c))
    );
  }

  return (
    <div className="flex h-screen">
      <CaseManagementSidebar />
      {/* Sidebar */}
      {/* <aside className="w-35 shrink-0 flex flex-col py-4 px-3 border-r border-border">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="flex items-center gap-1 justify-start"
        >
          ← Back
        </Button>

        <div className="border-t border-border -mx-3 mt-2" />

        <div className="flex-1 flex flex-col justify-center gap-1 -translate-y-30">
          <Button variant="ghost" className="w-full justify-start">
            Open Cases
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            Search
          </Button>
          <Button variant="ghost" className="w-full justify-start">
            New Case
          </Button>
        </div>

        <div className="border-t border-border -mx-3 mb-2" />
        <div className="flex flex-col items-center gap-1 pb-2">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </div>
          <div className="border-t border-border w-full" />
          <span className="text-xs text-muted-foreground">Doron Mizachi</span>
        </div>        
      </aside> */}

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Case Management</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{cases.length} total cases</span>
            <Button onClick={addDummyCase}>+ Add Case</Button>
          </div>
        </div>

        {dbPath && (
          <div className="mb-4 rounded-md bg-muted px-4 py-2 text-xs text-muted-foreground font-mono">
            DB: {dbPath}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-destructive px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          {(["all", "open", "in-progress", "closed"] as const).map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
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
                <th className="text-left px-4 py-3 font-medium">Subject</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-left px-4 py-3 font-medium">Updated</th>
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
                  <td className="px-4 py-3 font-medium">{c.subject}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.createdAt}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.updatedAt ?? "—"}</td>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No cases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
