"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { CaseRow } from "../../../lib/cases/crud";
import type { TaskRow } from "../../../lib/tasks/crud";
import type { MeetingRow } from "../../../lib/calendar/crud";
import type { DocumentRow } from "../../../lib/documents/crud";
import CaseTasksPanel from "./CaseTasksPanel";
import CaseMeetingsPanel from "./CaseMeetingsPanel";
import CaseDocumentsPanel from "./CaseDocumentsPanel";

const STATUS_OPTIONS = ["open", "waiting", "closed"];
type Tab = "overview" | "tasks" | "meetings" | "documents";

type CaseDetailClientProps = {
  initialCase: CaseRow;
  isOwner: boolean;
  initialTasks: TaskRow[];
  initialMeetings: MeetingRow[];
  initialDocuments: DocumentRow[];
};

export default function CaseDetailClient({
  initialCase,
  isOwner,
  initialTasks,
  initialMeetings,
  initialDocuments,
}: CaseDetailClientProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [caseRow, setCaseRow] = useState(initialCase);
  const [name, setName] = useState(initialCase.name);
  const [subject, setSubject] = useState(initialCase.subject ?? "");
  const [status, setStatus] = useState(initialCase.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${caseRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("cases_save_error"));
        return;
      }
      setCaseRow(data.case as CaseRow);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${caseRow.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? t("cases_delete_error"));
        return;
      }
      router.push("/app/cases");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col border border-border rounded-xl bg-card overflow-hidden shadow-xs flex-1 min-w-0">
      <div className="bg-muted px-4 py-3 border-b border-border">
        <h2 className="font-semibold text-sm text-foreground">{caseRow.name}</h2>
        {caseRow.subject && <p className="text-xs text-muted-foreground">{caseRow.subject}</p>}
      </div>

      <div className="flex gap-1 border-b border-border px-2">
        {(["overview", "tasks", "meetings", "documents"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(
              tab === "overview"
                ? "cases_tab_overview"
                : tab === "tasks"
                  ? "cases_tab_tasks"
                  : tab === "meetings"
                    ? "cases_tab_meetings"
                    : "cases_tab_documents"
            )}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-y-auto flex-1">
        {activeTab === "overview" ? (
          <div className="flex flex-col gap-3 max-w-md">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("cases_name_placeholder")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("cases_subject_placeholder")}</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("cases_status_label")}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2.5 text-sm capitalize"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {t("cases_save_button")}
              </Button>
              {isOwner && (
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {t("cases_delete_button")}
                </Button>
              )}
            </div>
          </div>
        ) : activeTab === "tasks" ? (
          <CaseTasksPanel caseId={caseRow.id} initialTasks={initialTasks} />
        ) : activeTab === "meetings" ? (
          <CaseMeetingsPanel caseId={caseRow.id} initialMeetings={initialMeetings} />
        ) : (
          <CaseDocumentsPanel caseId={caseRow.id} initialDocuments={initialDocuments} />
        )}
      </div>
    </div>
  );
}
