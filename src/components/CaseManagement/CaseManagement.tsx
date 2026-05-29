import CaseManagementSidebar from "./CasesManagementSidebar";
import { Route, Routes, useNavigate } from "react-router-dom";
import CaseManagementOpenCases from "./CaseManagementOpenCases";
import CasesManagementTemplate from "./CasesManagementTemplate/CasesManagementTemplate";

export default function CaseManagement() {
  const navigate = useNavigate();

  function handleTemplate() {
    navigate("templates");
  }

  return (
    <div className="flex h-screen">
      <CaseManagementSidebar handleTemplate={handleTemplate} />
      <Routes>
        <Route path="/" element={<CaseManagementOpenCases />} />
        <Route path="templates" element={<CasesManagementTemplate />} />

      </Routes>
      {/* Main content */}
      {/* <main className="flex-1 overflow-auto p-6">      
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
      </main> */}
    </div>
  );
}
