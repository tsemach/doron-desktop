"use client";

import { useState } from "react";
import { Button } from "@workspace/ui";
import type { CaseDocTemplateRow } from "../../../lib/docTemplates/crud";

type DocTemplatesListClientProps = {
  initialTemplates: CaseDocTemplateRow[];
  canManage: boolean;
};

// Individual document templates (e.g. Word files with placeholders) --
// not case templates (a collection of these, managed under Cases). See
// lib/docTemplates/crud.ts for the distinction.
export default function DocTemplatesListClient({ initialTemplates, canManage }: DocTemplatesListClientProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !fileName.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/doc-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, fileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the template. Please try again.");
        return;
      }
      setTemplates((prev) => [data.template as CaseDocTemplateRow, ...prev]);
      setTitle("");
      setFileName("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v1/doc-templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-foreground mb-6">Document Templates</h1>

      {canManage && (
        <form onSubmit={handleCreate} className="flex gap-2 mb-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Template title"
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
            required
          />
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="File name"
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
            required
          />
          <Button type="submit" disabled={submitting}>
            Create template
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No document templates yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{tpl.title}</span>
                <span className="text-xs text-muted-foreground">{tpl.fileName}</span>
              </div>
              {canManage && (
                <button onClick={() => handleDelete(tpl.id)} className="text-xs text-muted-foreground hover:text-destructive">
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
