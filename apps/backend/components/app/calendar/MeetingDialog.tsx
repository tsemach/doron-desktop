"use client";

import { useState } from "react";
import { Button } from "@workspace/ui";
import type { MeetingRow } from "../../../lib/calendar/crud";

type MeetingDialogProps = {
  mode: "create" | "edit";
  meeting?: MeetingRow;
  cases: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (meeting: MeetingRow) => void;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time --
// built from the Date object's own local getters, matching what the
// browser's picker itself would produce.
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Uses the browser's native <input type="datetime-local"> picker --
// confirmed fine as-is, no custom date-picker component needed.
export default function MeetingDialog({ mode, meeting, cases, onClose, onSaved }: MeetingDialogProps) {
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [startTime, setStartTime] = useState(meeting ? toLocalInputValue(new Date(meeting.startTime)) : "");
  const [endTime, setEndTime] = useState(meeting ? toLocalInputValue(new Date(meeting.endTime)) : "");
  const [caseId, setCaseId] = useState(meeting?.caseId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startTime || !endTime) return;

    setSubmitting(true);
    setError(null);
    try {
      const url = mode === "edit" && meeting ? `/api/v1/calendar/${meeting.id}` : "/api/v1/calendar";
      const res = await fetch(url, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // datetime-local's value is a naive local-time string with no
        // timezone info -- new Date() here parses it using the browser's
        // own timezone (correct: that's the user's real intent), then
        // .toISOString() sends an unambiguous UTC instant. Sending the
        // naive string straight through (the previous bug) let the
        // server -- whatever timezone it happens to run in -- reinterpret
        // "16:30" as ITS OWN local time instead of the browser's,
        // silently shifting the stored time whenever the two differ.
        body: JSON.stringify({
          title,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          caseId: caseId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save the meeting.");
        return;
      }
      onSaved(data.meeting as MeetingRow);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-[32rem] rounded-xl border border-border bg-card p-5 flex flex-col gap-3 shadow-lg"
      >
        <h3 className="text-sm font-semibold">{mode === "create" ? "New Meeting" : "Edit Meeting"}</h3>
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
        <select value={caseId ?? ""} onChange={(e) => setCaseId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
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
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
