"use client";

import { useState } from "react";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { MeetingRow } from "../../../lib/calendar/crud";

type CalendarClientProps = {
  initialMeetings: MeetingRow[];
  cases: { id: string; name: string }[];
};

export default function CalendarClient({ initialMeetings, cases }: CalendarClientProps) {
  const { t } = useLanguage();
  const [meetings, setMeetings] = useState(initialMeetings);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [caseId, setCaseId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, startTime, endTime, caseId: caseId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("calendar_create_error"));
        return;
      }
      const updated = [...meetings, data.meeting as MeetingRow].sort((a, b) => a.startTime.toString().localeCompare(b.startTime.toString()));
      setMeetings(updated);
      setTitle("");
      setStartTime("");
      setEndTime("");
      setCaseId("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v1/calendar/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-foreground mb-2">{t("nav_calendar")}</h1>
      <p className="text-xs text-muted-foreground mb-6">{t("calendar_local_only_note")}</p>

      <form onSubmit={handleCreate} className="flex flex-col gap-2 mb-8 rounded-lg border border-border bg-card p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("calendar_title_placeholder")}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
          required
        />
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
            required
          />
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
            required
          />
        </div>
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2.5 text-sm">
          <option value="">{t("calendar_no_case_link")}</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={submitting}>
          {t("calendar_create_button")}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("calendar_empty_state")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {meetings.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{m.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(m.startTime).toLocaleString()}</p>
              </div>
              <button onClick={() => handleDelete(m.id)} className="text-xs text-muted-foreground hover:text-destructive">
                {t("calendar_delete_button")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
