"use client";

import { useState } from "react";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { TaskRow } from "../../../lib/tasks/crud";

const STATUS_OPTIONS = ["Waiting", "In progress", "Cancel", "Done"];

type CaseTasksPanelProps = {
  caseId: string;
  initialTasks: TaskRow[];
};

export default function CaseTasksPanel({ caseId, initialTasks }: CaseTasksPanelProps) {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dueDate: dueDate || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("tasks_create_error"));
        return;
      }
      setTasks((prev) => [...prev, data.task as TaskRow]);
      setTitle("");
      setDueDate("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(taskId: string, status: string) {
    const res = await fetch(`/api/v1/cases/${caseId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? (data.task as TaskRow) : task)));
    }
  }

  async function handleDelete(taskId: string) {
    const res = await fetch(`/api/v1/cases/${caseId}/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
    }
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("tasks_title_placeholder")}
          className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
          required
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <Button type="submit" size="sm" disabled={submitting}>
          {t("tasks_add_button")}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("tasks_empty_state")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
              <div>
                <p className="text-sm text-foreground">{task.title}</p>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                  className="h-7 rounded-md border border-border bg-card px-2 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  aria-label={t("tasks_delete_button")}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
