"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { CaseRow } from "../../../lib/cases/crud";

// Overview only for now -- Tasks/Meetings/Documents tabs (per
// docs/backend-saas/phase-3-core-pages/design.md's case-detail tab set)
// are follow-up implementation PRs, each needing their own CRUD backend
// that doesn't exist yet.

const STATUS_OPTIONS = ["open", "waiting", "closed"];

type CaseDetailClientProps = {
  initialCase: CaseRow;
  isOwner: boolean;
};

export default function CaseDetailClient({ initialCase, isOwner }: CaseDetailClientProps) {
  const { t } = useLanguage();
  const router = useRouter();
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
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/app/cases" className="text-sm text-muted-foreground hover:text-foreground">
        {t("cases_back_to_list")}
      </Link>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
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

      <p className="mt-4 text-xs text-muted-foreground">{t("cases_tabs_coming_soon")}</p>
    </div>
  );
}
