import { useState } from "react";
import { format } from "date-fns";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  placeholder?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combine(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}

export default function DateTimePicker({ value, onChange, minDate, placeholder }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const base = value ?? new Date();
  const [dateStr, setDateStr] = useState(toDateInputValue(base));
  const [timeStr, setTimeStr] = useState(toTimeInputValue(base));

  const candidate = combine(dateStr, timeStr);
  // A cleared date/time input yields an Invalid Date, whose comparisons are all
  // false -- check it explicitly or Confirm stays enabled and emits NaN.
  const isInvalid = Number.isNaN(candidate.getTime()) || (minDate ? candidate < minDate : false);

  function confirm() {
    if (isInvalid) return;
    onChange(candidate);
    setOpen(false);
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted cursor-pointer"
      >
        {value ? format(value, "MMM d, yyyy HH:mm") : (placeholder ?? "Pick date & time")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 w-56 rounded-lg border border-border bg-card shadow-lg p-3 z-40 flex flex-col gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-input bg-background"
            />
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-input bg-background"
            />
            {isInvalid && <div className="text-[10px] text-destructive">Must be in the future</div>}
            <button
              type="button"
              onClick={confirm}
              disabled={isInvalid}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </>
      )}
    </div>
  );
}
