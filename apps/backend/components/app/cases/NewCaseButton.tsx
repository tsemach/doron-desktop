"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";

// Matches desktop's "+ New Case" button. No dialog primitive exists in
// packages/ui yet (PR-5's scope is presentational primitives only, added
// as 2+ apps actually need them) -- a minimal local overlay instead of
// pulling in a new dependency this deep into the page rebuild.
export default function NewCaseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject: subject || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the case.");
        return;
      }
      setOpen(false);
      setName("");
      setSubject("");
      router.push(`/app/cases/${data.case.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Case</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            className="w-96 rounded-xl border border-border bg-card p-5 flex flex-col gap-3 shadow-lg"
          >
            <h3 className="text-sm font-semibold">New Case</h3>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Case name"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              autoFocus
              required
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                Create
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
