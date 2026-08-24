"use client";

import { useState } from "react";
import { Button } from "@workspace/ui";
import type { MeetingRow } from "../../../lib/calendar/crud";

type NewMeetingDialogProps = {
  cases: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (meeting: MeetingRow) => void;
};

// Uses the browser's native <input type="datetime-local"> picker --
// confirmed fine as-is, no custom date-picker component needed.
export default function NewMeetingDialog({ cases, onClose, onCreated }: NewMeetingDialogProps) {
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
        setError(data.error ?? "Couldn't create the meeting.");
        return;
      }
      onCreated(data.meeting as MeetingRow);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onSubmit={handleCreate}
        onClick={(e) => e.stopPropagation()}
        className="w-[32rem] rounded-xl border border-border bg-card p-5 flex flex-col gap-3 shadow-lg"
      >
        <h3 className="text-sm font-semibold">New Meeting</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          autoFocus
          required
        />
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
            required
          />
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
            required
          />
        </div>
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
          <option value="">No case link</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            Create
          </Button>
        </div>
      </form>
    </div>
  );
}
