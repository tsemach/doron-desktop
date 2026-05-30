import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

type CaseStatus = "open" | "in-progress" | "closed";

interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;
}

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "in-progress": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function CaseManagementOpenCases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<CaseStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<string>("get_db_path").then(setDbPath).catch(() => {});
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<any[]>("list_cases");
      const mapped = res.map((c) => ({
        id: String(c.id),
        subject: c.subject,
        status: c.status as CaseStatus,
        name: c.name,
        createdAt: c.created_at ? c.created_at.split("T")[0] : "—",
        updatedAt: c.updated_at ? c.updated_at.split("T")[0] : undefined,
        folder: c.folder,
      }));
      setCases(mapped);
    } catch (err) {
      setError("Failed to load cases: " + err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === "all" ? cases : cases.filter((c) => c.status === filter);

  function closeCase(id: string) {
    // For now update locally. We can extend to support database close later.
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "closed" } : c))
    );
  }

  async function handleDeleteCase(id: string) {
    if (!confirm("Are you sure you want to delete this case?")) return;
    setError(null);
    try {
      await invoke("delete_case", { id: Number(id) });
      setCases((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError("Failed to delete case: " + err);
    }
  }

  return (          
    <main className="flex-1 overflow-auto p-6 bg-background">      
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Case Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track active cases, their statuses, and associated documents.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{cases.length} total cases</span>
          <Button onClick={() => navigate("/case-management/new-case")}>+ Add Case</Button>
        </div>
      </div>

      {dbPath && (
        <div className="mb-4 rounded-md bg-muted/50 border border-border px-4 py-2 text-xs text-muted-foreground font-mono">
          Database: {dbPath}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
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

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <div className="animate-spin text-2xl font-bold mb-2">⟳</div>
          <p className="text-sm">Loading cases...</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">ID</th>
                <th className="text-left px-4 py-3 font-medium">Subject</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Customer Name</th>
                <th className="text-left px-4 py-3 font-medium">Folder Path</th>
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
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate" title={c.folder}>
                    {c.folder ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.createdAt}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.updatedAt ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCase(c.id)}
                        className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No cases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>    
  );
}
