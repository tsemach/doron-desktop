# Case Overview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the case-detail page's mislabeled "Overview" sidebar button (which currently just shows document preview) with a real case summary: tasks quick-view, recent emails, full note text, tags, plus case-type and needs-follow-up badges in the page header.

**Architecture:** Pure frontend change (no Rust/backend work — all data comes from existing Tauri commands, one of which — `list_case_emails` — gets a second caller). A new `CaseOverviewPanel` component becomes the default landing content of the case-detail right panel, assembled from two new data-fetching card components (`CaseOverviewTasksCard`, `CaseOverviewEmailsCard`) plus inline Notes/Tags/follow-up sections that read data already present on the `Case` object. The existing `CaseDetailTab` union (currently duplicated across 3 files) gains a new `"overview"` member and becomes the default/fallback tab everywhere `"preview"` used to be.

**Tech Stack:** React + TypeScript, Tailwind v4, Tauri `invoke()`, existing `useLanguage()` i18n.

## Global Constraints

- No new dependencies.
- No Rust/backend changes — every data source is an existing Tauri command or already-loaded `Case` field.
- Task rows in Overview are **read-only** (no status change, edit, delete, drag) — full task management stays on the Tasks tab.
- Notes/Tags in Overview are **read-only** — editing stays on the existing "Edit case notes & tags" kebab action.
- Header case-type badge hidden entirely when no `type` tag is set. Header needs-follow-up badge shown only when the follow-up date is overdue or due today (not for a comfortably-future pending date).
- Verification is manual (`npx tsc --noEmit` + running the app) — this repo has no automated frontend test harness; that is the established practice for this project, not a shortcut.
- Spec: `docs/superpowers/specs/2026-08-17-case-overview-design.md` — every requirement in it must map to a task below.

---

## File Structure

**New files:**
- `apps/desktop/src/lib/formatShortDate.ts` — `formatShortDate` helper, extracted out of `TaskRow.tsx` (where it was named `formatDueDate`) so it has one home instead of being duplicated — renamed since Task 6 reuses it for email dates, not just task due dates, and living under `lib/task/` would make an Emails card import from a task-domain module.
- `apps/desktop/src/lib/caseTags.ts` — `findTagValue`/`filterOverviewTags` helpers shared by the header badges and the Overview panel.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx` — top-level Overview content: follow-up banner, two-column grid, Notes/Tags cards inline.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewTasksCard.tsx` — left-column tasks quick-view.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewEmailsCard.tsx` — left-column emails quick-view.

**Modified files:**
- `apps/desktop/src/components/ui/TaskRow.tsx` — use the extracted `formatShortDate` instead of its own local `formatDueDate` copy.
- `apps/desktop/src/components/CaseManagement/caseTypeOptions.ts` — add `findCaseTypeOption`.
- `apps/desktop/src/locales/en.json`, `apps/desktop/src/locales/he.json` — new keys: `notes`, `tags`, `no_notes_for_case`, `no_tags_for_case`, `needs_followup`.
- `apps/desktop/src/components/CaseManagement/CaseDetailSidebar.tsx` — add `"overview"` to `CaseDetailTab`; the "Overview" button now targets it.
- `apps/desktop/src/components/CaseManagement/CaseDetailLayout.tsx` — default `activeRightTab` becomes `"overview"`.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanelTopMenu.tsx` — import the shared `CaseDetailTab` type instead of a duplicated inline union; Emails/Tasks toggle fallback becomes `"overview"`.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanel.tsx` — same type-import fix; default prop becomes `"overview"`.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx` — render `CaseOverviewPanel` for the new tab; header gets case-type + needs-follow-up badges.

---

### Task 1: Extract shared `formatShortDate` helper

**Files:**
- Create: `apps/desktop/src/lib/formatShortDate.ts`
- Modify: `apps/desktop/src/components/ui/TaskRow.tsx`

**Interfaces:**
- Produces: `formatShortDate(iso: string): string` — takes an ISO date string, returns a short localized date (e.g. "Aug 17, 2026"), or the first 10 characters of the input if parsing throws.

- [ ] **Step 1: Create the helper file**

```ts
// apps/desktop/src/lib/formatShortDate.ts
export function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}
```

- [ ] **Step 2: Remove the local copy from `TaskRow.tsx` and import the shared one**

In `apps/desktop/src/components/ui/TaskRow.tsx`, replace:

```ts
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";
import TaskStatusBadge from "./TaskStatusBadge";
import TaskStatusSelect from "./TaskStatusSelect";

const DUE_DATE_STYLES: Record<string, string> = {
  overdue: "text-destructive font-medium",
  "due-today": "text-amber-600 dark:text-amber-400 font-medium",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
};
```

with:

```ts
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";
import { formatShortDate } from "@/lib/formatShortDate";
import TaskStatusBadge from "./TaskStatusBadge";
import TaskStatusSelect from "./TaskStatusSelect";

const DUE_DATE_STYLES: Record<string, string> = {
  overdue: "text-destructive font-medium",
  "due-today": "text-amber-600 dark:text-amber-400 font-medium",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
};
```

Then delete this block entirely (it's now provided by the import):

```ts
function formatDueDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}
```

Finally, update the one call site inside this file — replace:

```tsx
          {task.due_date && (
            <p className={`text-xs ${DUE_DATE_STYLES[urgency]}`}>Due {formatDueDate(task.due_date)}</p>
          )}
```

with:

```tsx
          {task.due_date && (
            <p className={`text-xs ${DUE_DATE_STYLES[urgency]}`}>Due {formatShortDate(task.due_date)}</p>
          )}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors (the one pre-existing unrelated error in `AppHome.tsx` may still appear — that's not from this change).

- [ ] **Step 4: Manually verify**

Open the app, go to any case with tasks that have due dates, confirm the due date still renders exactly as before on each task row.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/formatShortDate.ts apps/desktop/src/components/ui/TaskRow.tsx
git commit -m "Extract formatShortDate into a shared helper"
```

---

### Task 2: Case-tag lookup helpers

**Files:**
- Create: `apps/desktop/src/lib/caseTags.ts`
- Modify: `apps/desktop/src/components/CaseManagement/caseTypeOptions.ts`

**Interfaces:**
- Consumes: `Tag` from `@/components/CaseManagement/CaseManagementTypes` (fields: `id, scope_type, scope_value?, name, value?, type, created_at, updated_at`).
- Produces:
  - `findTagValue(tags: Tag[], name: string): string | undefined`
  - `filterOverviewTags(tags: Tag[]): Tag[]`
  - `findCaseTypeOption(value: string | undefined): CaseTypeOption | undefined` (added to `caseTypeOptions.ts`)

- [ ] **Step 1: Create `caseTags.ts`**

```ts
// apps/desktop/src/lib/caseTags.ts
import { Tag } from "@/components/CaseManagement/CaseManagementTypes";

// Tags that get dedicated treatment elsewhere in the case-detail UI (the
// header's case-type badge, the Overview follow-up banner) and so are
// excluded from generic tag chip lists to avoid showing the same fact twice.
const DEDICATED_TAG_NAMES = ["type", "followup"];

export function findTagValue(tags: Tag[], name: string): string | undefined {
  return tags.find((t) => t.name.toLowerCase() === name)?.value;
}

export function filterOverviewTags(tags: Tag[]): Tag[] {
  return tags.filter((t) => !DEDICATED_TAG_NAMES.includes(t.name.toLowerCase()));
}
```

- [ ] **Step 2: Add `findCaseTypeOption` to `caseTypeOptions.ts`**

Read the file first to confirm the exact current export list, then append this function after the existing `CASE_TYPE_OPTIONS` array export:

```ts
export function findCaseTypeOption(value: string | undefined): CaseTypeOption | undefined {
  return value ? CASE_TYPE_OPTIONS.find((o) => o.value === value) : undefined;
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/caseTags.ts apps/desktop/src/components/CaseManagement/caseTypeOptions.ts
git commit -m "Add case-tag and case-type lookup helpers"
```

---

### Task 3: New i18n keys

**Files:**
- Modify: `apps/desktop/src/locales/en.json`
- Modify: `apps/desktop/src/locales/he.json`

**Interfaces:**
- Produces: translation keys `notes`, `tags`, `no_notes_for_case`, `no_tags_for_case`, `needs_followup` (added to the `TranslationKey` union derived from `en.json`, used by Tasks 4–7).

- [ ] **Step 1: Add keys to `en.json`**

Find this line (currently followed directly by `"search_documents_placeholder"`):

```json
  "view_all_cases": "View all",
  "search_documents_placeholder": "Search documents in Hebrew or English...",
```

Replace with:

```json
  "view_all_cases": "View all",
  "notes": "Notes",
  "tags": "Tags",
  "no_notes_for_case": "No notes for this case yet.",
  "no_tags_for_case": "No tags for this case.",
  "needs_followup": "Needs Follow-up",
  "search_documents_placeholder": "Search documents in Hebrew or English...",
```

- [ ] **Step 2: Add matching keys to `he.json`**

Find:

```json
  "view_all_cases": "הצג הכל",
  "search_documents_placeholder": "חפש מסמכים בעברית או באנגלית...",
```

Replace with:

```json
  "view_all_cases": "הצג הכל",
  "notes": "הערות",
  "tags": "תגיות",
  "no_notes_for_case": "אין הערות לתיק זה.",
  "no_tags_for_case": "אין תגיות לתיק זה.",
  "needs_followup": "דורש מעקב",
  "search_documents_placeholder": "חפש מסמכים בעברית או באנגלית...",
```

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors (both JSON files must stay valid JSON — trailing commas will break the build).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/locales/en.json apps/desktop/src/locales/he.json
git commit -m "Add translation keys for the case Overview panel"
```

---

### Task 4: Wire "overview" as the default tab, with an initial `CaseOverviewPanel`

**Files:**
- Modify: `apps/desktop/src/components/CaseManagement/CaseDetailSidebar.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseDetailLayout.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanelTopMenu.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanel.tsx`
- Create: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx`

**Interfaces:**
- Consumes: `Tag`, `Case` from `../CaseManagementTypes`; `TagChip` from `@/components/ui/TagChip` (props: `{ tag: Tag; onRemove?: (tag: Tag) => void }` — omitting `onRemove` makes it read-only); `getFollowupStatus` from `@/lib/followupStatus`; `findTagValue`, `filterOverviewTags` from `@/lib/caseTags` (Task 2).
- Produces: `CaseDetailTab = "overview" | "preview" | "emails" | "tasks"` (was `"preview" | "emails" | "tasks"`) — every other task in this plan that touches tab state relies on this exact union. `CaseOverviewPanel` component, props `{ selectedCase: Case; onViewTasks: () => void; onViewEmails: () => void }` (the `caseId` prop is added in Task 5, not here).

- [ ] **Step 1: Widen `CaseDetailTab` and repoint the "Overview" sidebar button**

In `apps/desktop/src/components/CaseManagement/CaseDetailSidebar.tsx`, replace:

```ts
export type CaseDetailTab = "preview" | "emails" | "tasks";
```

with:

```ts
export type CaseDetailTab = "overview" | "preview" | "emails" | "tasks";
```

Then replace the first `<SidebarNavButton>` block:

```tsx
          <SidebarNavButton
            label={t("overview")}
            active={activeRightTab === "preview"}
            onClick={() => onTabChange("preview")}
          />
```

with:

```tsx
          <SidebarNavButton
            label={t("overview")}
            active={activeRightTab === "overview"}
            onClick={() => onTabChange("overview")}
          />
```

- [ ] **Step 2: Change the default landing tab**

In `apps/desktop/src/components/CaseManagement/CaseDetailLayout.tsx`, replace:

```ts
  const [activeRightTab, setActiveRightTab] = useState<CaseDetailTab>("preview");
```

with:

```ts
  const [activeRightTab, setActiveRightTab] = useState<CaseDetailTab>("overview");
```

- [ ] **Step 3: Consolidate the duplicated tab-union type and fix the toggle fallbacks in `OpenCasesDocumentsPanelTopMenu.tsx`**

Add this import near the top of `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanelTopMenu.tsx`:

```ts
import type { CaseDetailTab } from "../CaseDetailSidebar";
```

Replace:

```ts
interface OpenDocumentsPanelTopMenuProps {
  selectedCase: Case | null;
  activeRightTab: "preview" | "emails" | "tasks";
  onTabChange?: (tab: "preview" | "emails" | "tasks") => void;
  onAddDocument: () => void;
  onEditCaseAnnotations?: () => void;
  isDetailView?: boolean;
}
```

with:

```ts
interface OpenDocumentsPanelTopMenuProps {
  selectedCase: Case | null;
  activeRightTab: CaseDetailTab;
  onTabChange?: (tab: CaseDetailTab) => void;
  onAddDocument: () => void;
  onEditCaseAnnotations?: () => void;
  isDetailView?: boolean;
}
```

Then in the kebab menu's `items` array, replace the two toggle `onClick`s:

```ts
              onClick: () => onTabChange?.(activeRightTab === "emails" ? "preview" : "emails"),
```

with:

```ts
              onClick: () => onTabChange?.(activeRightTab === "emails" ? "overview" : "emails"),
```

and:

```ts
              onClick: () => onTabChange?.(activeRightTab === "tasks" ? "preview" : "tasks"),
```

with:

```ts
              onClick: () => onTabChange?.(activeRightTab === "tasks" ? "overview" : "tasks"),
```

- [ ] **Step 4: Same type consolidation in `OpenCasesDocumentsPanel.tsx`**

Add this import near the top of `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanel.tsx`:

```ts
import type { CaseDetailTab } from "../CaseDetailSidebar";
```

Replace:

```ts
  activeRightTab?: "preview" | "emails" | "tasks";
  onTabChange?: (tab: "preview" | "emails" | "tasks") => void;
```

with:

```ts
  activeRightTab?: CaseDetailTab;
  onTabChange?: (tab: CaseDetailTab) => void;
```

Replace the default prop:

```ts
  activeRightTab = "preview",
```

with:

```ts
  activeRightTab = "overview",
```

- [ ] **Step 5: Create the initial `CaseOverviewPanel`**

```tsx
// apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx
import { useLanguage } from "@/context/LanguageContext";
import TagChip from "@/components/ui/TagChip";
import { getFollowupStatus } from "@/lib/followupStatus";
import { findTagValue, filterOverviewTags } from "@/lib/caseTags";
import { Case } from "../CaseManagementTypes";

interface CaseOverviewPanelProps {
  selectedCase: Case;
  onViewTasks: () => void;
  onViewEmails: () => void;
}

export default function CaseOverviewPanel({ selectedCase, onViewTasks, onViewEmails }: CaseOverviewPanelProps) {
  const { t } = useLanguage();

  const followupStatus = getFollowupStatus(findTagValue(selectedCase.tags, "followup"));
  const overviewTags = filterOverviewTags(selectedCase.tags);

  return (
    <div className="p-4 space-y-3">
      {followupStatus && (
        <div
          className={`rounded-md border px-3 py-2 text-xs font-semibold flex items-center gap-1.5 ${
            followupStatus.type === "overdue"
              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200/50"
              : followupStatus.type === "due-today"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/50"
              : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 border-blue-100/30"
          }`}
        >
          <span>{followupStatus.type === "overdue" ? "⚠️" : followupStatus.type === "due-today" ? "⏰" : "📅"}</span>
          {followupStatus.label}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-3">
          {/* CaseOverviewTasksCard slots in here (Task 5); CaseOverviewEmailsCard below it (Task 6) */}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("notes")}</h4>
            {selectedCase.notes ? (
              <p className="text-xs text-muted-foreground italic whitespace-pre-line">{selectedCase.notes}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("no_notes_for_case")}</p>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("tags")}</h4>
            {overviewTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {overviewTags.map((tag) => (
                  <TagChip key={tag.id} tag={tag} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("no_tags_for_case")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

`onViewTasks`/`onViewEmails` are accepted now (unused inside this file until Tasks 5 & 6 pass them to the new cards) — TypeScript does not flag unused destructured props, so this is safe to leave as-is between tasks.

- [ ] **Step 6: Wire `CaseOverviewPanel` into `CaseManagementOpenCasesDetails.tsx`**

Add the import near the other panel imports:

```ts
import CaseOverviewPanel from "./CaseOverviewPanel";
```

Replace the header-title ternary chain:

```tsx
                <span className="truncate">
                  {activeRightTab === "emails"
                    ? (t("emails_exchange") || "Case Email Correspondence")
                    : activeRightTab === "tasks"
                    ? "Tasks"
                    : (t("document_details") || "Document Details")}
                </span>
```

with:

```tsx
                <span className="truncate">
                  {activeRightTab === "emails"
                    ? (t("emails_exchange") || "Case Email Correspondence")
                    : activeRightTab === "tasks"
                    ? "Tasks"
                    : activeRightTab === "overview"
                    ? t("overview")
                    : (t("document_details") || "Document Details")}
                </span>
```

Replace the main content switch:

```tsx
              {activeRightTab === "emails" ? (
                <CaseEmailsChat
                  caseId={Number(selectedCase?.id || 0)}
                  caseFolder={selectedCase?.folder || ""}
                />
              ) : activeRightTab === "tasks" ? (
                <CaseTasksPanel caseId={Number(selectedCase?.id || 0)} />
              ) : docSubTab === "history" && selectedDocument ? (
```

with:

```tsx
              {activeRightTab === "emails" ? (
                <CaseEmailsChat
                  caseId={Number(selectedCase?.id || 0)}
                  caseFolder={selectedCase?.folder || ""}
                />
              ) : activeRightTab === "tasks" ? (
                <CaseTasksPanel caseId={Number(selectedCase?.id || 0)} />
              ) : activeRightTab === "overview" && selectedCase ? (
                <CaseOverviewPanel
                  selectedCase={selectedCase}
                  onViewTasks={() => setActiveRightTab("tasks")}
                  onViewEmails={() => setActiveRightTab("emails")}
                />
              ) : docSubTab === "history" && selectedDocument ? (
```

(If `selectedCase` is null while `activeRightTab === "overview"` — e.g. the case failed to load — this falls through to the existing document-preview branch, which already handles a null case/document gracefully today. That's the same degradation the code already has for `"preview"` in that situation, not new behavior.)

- [ ] **Step 7: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manually verify**

Run the app, open any case:
- Confirm the sidebar's "Overview" button is active by default and shows the new panel (follow-up banner if the case has one, Notes card, Tags card, empty left column).
- Click "Emails" then "Tasks" in the kebab menu, then click "Overview" in the sidebar — confirm it returns correctly each time.
- Click a document in the left file list — confirm it still switches to document preview as before.
- Toggle Emails/Tasks off via the kebab menu (click again) — confirm it now lands back on Overview, not document preview.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/components/CaseManagement/CaseDetailSidebar.tsx \
        apps/desktop/src/components/CaseManagement/CaseDetailLayout.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanelTopMenu.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentsPanel.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx
git commit -m "Add Overview tab: follow-up banner, notes, and tags"
```

---

### Task 5: Tasks quick-view card

**Files:**
- Create: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewTasksCard.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx`

**Interfaces:**
- Consumes: `Task`/`TaskStatus` from `@/lib/task/types`; `STATUS_OPTION_COLORS` from `@/lib/task/statusColors`; `formatShortDate` from `@/lib/formatShortDate` (Task 1); Tauri command `list_tasks_for_case(caseId: number) -> Task[]` (existing, unchanged).
- Produces: `CaseOverviewTasksCard` component, props `{ caseId: number; onViewAll: () => void }`.

- [ ] **Step 1: Create the card**

```tsx
// apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewTasksCard.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { Task } from "@/lib/task/types";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";
import { formatShortDate } from "@/lib/formatShortDate";

interface CaseOverviewTasksCardProps {
  caseId: number;
  onViewAll: () => void;
}

export default function CaseOverviewTasksCard({ caseId, onViewAll }: CaseOverviewTasksCardProps) {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    invoke<Task[]>("list_tasks_for_case", { caseId })
      .then((res) => {
        if (active) setTasks(res);
      })
      .catch((err) => {
        if (active) setError(String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId]);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("tasks")}</h4>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
          >
            {t("view_all_cases")} →
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading tasks...</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No tasks for this case yet.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-b-0"
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  backgroundColor: STATUS_OPTION_COLORS[task.status].color,
                  boxShadow: `0 0 0 2px ${STATUS_OPTION_COLORS[task.status].backgroundColor}`,
                }}
                title={task.status}
              />
              <span className="flex-1 min-w-0 truncate text-foreground" title={task.title}>
                {task.title}
              </span>
              {task.due_date && (
                <span className="text-[10px] text-muted-foreground shrink-0">{formatShortDate(task.due_date)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Slot it into `CaseOverviewPanel.tsx`**

Add the import:

```ts
import CaseOverviewTasksCard from "./CaseOverviewTasksCard";
```

Add `caseId` to the props interface and destructuring:

```ts
interface CaseOverviewPanelProps {
  caseId: number;
  selectedCase: Case;
  onViewTasks: () => void;
  onViewEmails: () => void;
}

export default function CaseOverviewPanel({ caseId, selectedCase, onViewTasks, onViewEmails }: CaseOverviewPanelProps) {
```

Replace the placeholder comment:

```tsx
        <div className="space-y-3">
          {/* CaseOverviewTasksCard slots in here (Task 5); CaseOverviewEmailsCard below it (Task 6) */}
        </div>
```

with:

```tsx
        <div className="space-y-3">
          <CaseOverviewTasksCard caseId={caseId} onViewAll={onViewTasks} />
        </div>
```

- [ ] **Step 3: Pass `caseId` from `CaseManagementOpenCasesDetails.tsx`**

Replace:

```tsx
                <CaseOverviewPanel
                  selectedCase={selectedCase}
                  onViewTasks={() => setActiveRightTab("tasks")}
                  onViewEmails={() => setActiveRightTab("emails")}
                />
```

with:

```tsx
                <CaseOverviewPanel
                  caseId={Number(selectedCase.id)}
                  selectedCase={selectedCase}
                  onViewTasks={() => setActiveRightTab("tasks")}
                  onViewEmails={() => setActiveRightTab("emails")}
                />
```

- [ ] **Step 4: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manually verify**

Open a case with several tasks in different statuses (some with due dates, some without). On the Overview tab, confirm: each task shows as one line (colored dot + title + due date if present), the list scrolls if there are many tasks, and clicking "View all →" switches to the Tasks tab. Open a case with zero tasks and confirm the empty-state text shows instead.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewTasksCard.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx
git commit -m "Add tasks quick-view card to case Overview"
```

---

### Task 6: Emails quick-view card

**Files:**
- Create: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewEmailsCard.tsx`
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx`

**Interfaces:**
- Consumes: `formatShortDate` from `@/lib/formatShortDate` (Task 1); Tauri command `list_case_emails(caseId: number) -> CaseEmail[]` (existing, unchanged — this is a second caller; the first is `OpenCasesEmailsChat.tsx`). This component declares its own minimal `CaseEmailSummary` interface (`id`, `sender`, `subject`, `received_at`) rather than importing `OpenCasesEmailsChat.tsx`'s private `CaseEmail` interface, since that interface isn't exported and this card only needs 4 of its fields.
- Produces: `CaseOverviewEmailsCard` component, props `{ caseId: number; onViewAll: () => void }`.

- [ ] **Step 1: Create the card**

```tsx
// apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewEmailsCard.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { formatShortDate } from "@/lib/formatShortDate";

// Minimal subset of the full CaseEmail shape (declared privately in
// OpenCasesEmailsChat.tsx) -- this card only needs these four fields.
interface CaseEmailSummary {
  id: number;
  sender: string;
  subject: string;
  received_at: string;
}

interface CaseOverviewEmailsCardProps {
  caseId: number;
  onViewAll: () => void;
}

const MAX_EMAILS_SHOWN = 5;

export default function CaseOverviewEmailsCard({ caseId, onViewAll }: CaseOverviewEmailsCardProps) {
  const { t } = useLanguage();
  const [emails, setEmails] = useState<CaseEmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    invoke<CaseEmailSummary[]>("list_case_emails", { caseId })
      .then((res) => {
        if (!active) return;
        const sorted = [...res].sort(
          (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
        );
        setEmails(sorted.slice(0, MAX_EMAILS_SHOWN));
      })
      .catch((err) => {
        if (active) setError(String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId]);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("emails")}</h4>
        {emails.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
          >
            {t("view_all_cases")} →
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : emails.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("no_emails")}</p>
      ) : (
        <div className="space-y-1.5">
          {emails.map((email) => (
            <div key={email.id} className="text-xs py-1 border-b border-border/50 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground" title={email.subject}>
                  {email.subject}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatShortDate(email.received_at)}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate" title={email.sender}>
                {email.sender}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Slot it into `CaseOverviewPanel.tsx`**

Add the import:

```ts
import CaseOverviewEmailsCard from "./CaseOverviewEmailsCard";
```

Replace:

```tsx
        <div className="space-y-3">
          <CaseOverviewTasksCard caseId={caseId} onViewAll={onViewTasks} />
        </div>
```

with:

```tsx
        <div className="space-y-3">
          <CaseOverviewTasksCard caseId={caseId} onViewAll={onViewTasks} />
          <CaseOverviewEmailsCard caseId={caseId} onViewAll={onViewEmails} />
        </div>
```

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manually verify**

Open a case with emails linked. On the Overview tab, confirm up to 5 emails show, most recent first, each with subject/sender/date, and "View all →" switches to the Emails tab. Open a case with zero emails and confirm the reused "No email correspondence found for this case." empty state shows.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewEmailsCard.tsx \
        apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx
git commit -m "Add emails quick-view card to case Overview"
```

---

### Task 7: Case-type and needs-follow-up badges in the page header

**Files:**
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx`

**Interfaces:**
- Consumes: `findCaseTypeOption` from `../caseTypeOptions` (Task 2), `findTagValue` from `@/lib/caseTags` (Task 2), `getFollowupStatus` from `@/lib/followupStatus` (existing).

- [ ] **Step 1: Add the imports**

Near the top of `CaseManagementOpenCasesDetails.tsx`, alongside the existing imports:

```ts
import { findCaseTypeOption } from "../caseTypeOptions";
import { findTagValue } from "@/lib/caseTags";
import { getFollowupStatus } from "@/lib/followupStatus";
```

- [ ] **Step 2: Compute the badge data**

Immediately before the component's `return (` statement (right after the `confirmRemoveAttachment` function definition ends), add:

```ts
  const caseTypeOption = selectedCase ? findCaseTypeOption(findTagValue(selectedCase.tags, "type")) : undefined;
  const followupStatus = selectedCase ? getFollowupStatus(findTagValue(selectedCase.tags, "followup")) : null;
  const needsFollowupNow = followupStatus?.type === "overdue" || followupStatus?.type === "due-today";
```

- [ ] **Step 3: Render the badges next to the case title**

Replace:

```tsx
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/case-management" className="text-sm text-muted-foreground hover:underline">
              {t("case_management")}
            </Link>
            <span className="text-muted-foreground/60 text-xs">/</span>
            <span className="text-sm font-medium text-foreground">{t("case_detail")}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {selectedCase?.subject || t("loading_case_details")}
          </h1>
        </div>
      </div>
```

with:

```tsx
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/case-management" className="text-sm text-muted-foreground hover:underline">
              {t("case_management")}
            </Link>
            <span className="text-muted-foreground/60 text-xs">/</span>
            <span className="text-sm font-medium text-foreground">{t("case_detail")}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">
              {selectedCase?.subject || t("loading_case_details")}
            </h1>
            {caseTypeOption && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                {t(caseTypeOption.labelKey)}
              </span>
            )}
            {needsFollowupNow && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1">
                ⚠ {t("needs_followup")}
              </span>
            )}
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manually verify**

- Open a case that has a `type` tag set (e.g. created via the case-creation form's Case Type dropdown) — confirm its localized type badge shows next to the title, on every tab (Overview, Emails, Tasks, document preview), not just Overview.
- Open a case with no `type` tag — confirm no badge shows (no empty/placeholder badge).
- Open a case with an overdue or due-today follow-up date set — confirm the "⚠ Needs Follow-up" badge shows in the header.
- Open a case with a follow-up date comfortably in the future (pending) — confirm the header badge does NOT show, but the Overview panel's follow-up banner still does (📅, pending style).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx
git commit -m "Add case-type and needs-follow-up badges to case detail header"
```

---

### Task 8: Full end-to-end verification pass

No code changes — this closes out the plan by walking through every spec requirement against the running app.

- [ ] **Step 1: Type-check the whole frontend one more time**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: clean (aside from the pre-existing unrelated `AppHome.tsx` error noted in the spec).

- [ ] **Step 2: Walk the spec's requirements against the app**

Using a case that has tasks, emails, notes, tags, a case type, and a follow-up date, confirm:
- Case type badge and (if applicable) needs-follow-up badge appear in the header on every tab.
- Overview is the default tab when opening the case.
- Follow-up banner renders at the top of Overview matching the tag's overdue/due-today/pending state.
- Tasks card: every task, one line each, correct dot color per status, due date shown only when present, scrolls past ~6 rows, "View all →" jumps to the Tasks tab.
- Emails card: up to 5 most recent, correct order (newest first), "View all →" jumps to the Emails tab.
- Notes card: full untruncated text.
- Tags card: chips for every tag except `type` and `followup`.

- [ ] **Step 3: Repeat with a case missing each of those independently**

- No tasks → Tasks card empty state, no "View all" link.
- No emails → Emails card empty state, no "View all" link.
- No notes → Notes card empty state.
- No tags (beyond `type`/`followup`/system tags) → Tags card empty state.
- No follow-up tag → no banner, no header badge.
- No `type` tag → no header badge.
- Confirm nothing else on the page breaks when any of the above is missing.

- [ ] **Step 4: Confirm document preview still works from Overview**

Click a document in the left file list while on Overview — confirm it switches to document preview correctly, and that navigating back to Overview via the sidebar still works afterward.
