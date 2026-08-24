"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { CaseRow } from "../../../lib/cases/crud";

type CasesListClientProps = {
  initialCases: CaseRow[];
};

export default function CasesListClient({ initialCases }: CasesListClientProps) {
  const { t } = useLanguage();
  const [cases, setCases] = useState(initialCases);
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
        setError(data.error ?? t("cases_create_error"));
        return;
      }
      setCases((prev) => [data.case as CaseRow, ...prev]);
      setName("");
      setSubject("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">{t("nav_cases")}</h1>
        <Link href="/app/cases/templates" className="text-sm text-muted-foreground hover:text-foreground">
          {t("templates_title")}
        </Link>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-2 mb-8 rounded-lg border border-border bg-card p-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("cases_name_placeholder")}
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
            required
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("cases_subject_placeholder")}
            className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-sm"
          />
          <Button type="submit" disabled={submitting}>
            {t("cases_create_button")}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("cases_empty_state")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/cases/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  {c.subject && <p className="text-xs text-muted-foreground">{c.subject}</p>}
                </div>
                <span className="text-xs text-muted-foreground capitalize">{c.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
