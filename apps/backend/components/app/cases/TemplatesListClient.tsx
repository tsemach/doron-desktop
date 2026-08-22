"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { CaseTemplateRow } from "../../../lib/templates/crud";

type TemplatesListClientProps = {
  initialTemplates: CaseTemplateRow[];
  canManage: boolean;
};

export default function TemplatesListClient({ initialTemplates, canManage }: TemplatesListClientProps) {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState(initialTemplates);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/case-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("templates_create_error"));
        return;
      }
      setTemplates((prev) => [data.template as CaseTemplateRow, ...prev]);
      setName("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v1/case-templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/app/cases" className="text-sm text-muted-foreground hover:text-foreground">
        {t("cases_back_to_list")}
      </Link>

      <h1 className="text-xl font-bold text-foreground mt-4 mb-6">{t("templates_title")}</h1>

      {canManage && (
        <form onSubmit={handleCreate} className="flex gap-2 mb-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("templates_name_placeholder")}
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
            required
          />
          <Button type="submit" disabled={submitting}>
            {t("templates_create_button")}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("templates_empty_state")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <span className="text-sm text-foreground">{tpl.name}</span>
              {canManage && (
                <button onClick={() => handleDelete(tpl.id)} className="text-xs text-muted-foreground hover:text-destructive">
                  {t("templates_delete_button")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
