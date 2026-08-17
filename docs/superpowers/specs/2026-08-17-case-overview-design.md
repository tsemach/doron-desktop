# Case Overview — design spec

## Context

The case detail page's left nav rail (`CaseDetailSidebar.tsx`) already shows an "Overview" button, but it's a leftover mislabel: clicking it just sets `activeRightTab = "preview"`, which renders the document preview panel — not a case summary. No real overview component exists.

The right panel currently has three states (`CaseDetailTab = "preview" | "emails" | "tasks"`), each toggled from `OpenCasesDocumentsPanelTopMenu.tsx`'s kebab menu, with `"preview"` hardcoded as the universal default/fallback state in `CaseDetailLayout.tsx`, `OpenCasesDocumentsPanelTopMenu.tsx`, and `OpenCasesDocumentsPanel.tsx`. This union type is duplicated verbatim across those three files instead of importing a single shared type from `CaseDetailSidebar.tsx`.

## Goal

Give the user a genuine at-a-glance summary of a case: what tasks are open, whether emails are attached, what the case notes say, what tags are set, what type of case it is, and whether it needs follow-up — without navigating between tabs.

## Non-goals

- Not a second place to *edit* notes/tags — editing stays on the existing "Edit case notes & tags" modal (reachable from the kebab menu on any tab).
- Not a full inbox — the email section is a teaser (5 most recent), not a replacement for the Emails tab.
- Not an interactive task manager — task rows are read-only (no status change, edit, delete, drag, or description expand); that stays on the Tasks tab.

## Architecture changes

1. **Consolidate the duplicated `CaseDetailTab` union.** Today it's independently declared in `CaseDetailSidebar.tsx`, `OpenCasesDocumentsPanelTopMenu.tsx`, and `OpenCasesDocumentsPanel.tsx`. All three should import the one type from `CaseDetailSidebar.tsx`. Add `"overview"` as a new member: `"overview" | "preview" | "emails" | "tasks"`.
2. **`"overview"` becomes the default/landing state**, replacing `"preview"`'s role as the universal fallback:
   - `CaseDetailLayout.tsx`: initial `useState<CaseDetailTab>("overview")` (was `"preview"`).
   - `OpenCasesDocumentsPanelTopMenu.tsx`'s Emails/Tasks kebab toggles currently fall back to `"preview"` when turned off (e.g. `activeRightTab === "emails" ? "preview" : "emails"`) — these fallbacks change to `"overview"`.
   - The sidebar's "Overview" button (`CaseDetailSidebar.tsx`) now sets `activeRightTab("overview")` instead of `"preview"`.
   - Clicking a document in the file list still explicitly sets `activeRightTab = "preview"` (`CaseManagementOpenCasesDetails.tsx`'s `onSelectDocument`) — unchanged, this is correct as-is.
3. **`CaseManagementOpenCasesDetails.tsx`** gets a new branch in both the right-panel header-title switch and the main content switch, rendering the new `CaseOverviewPanel` when `activeRightTab === "overview"`.
4. **Page header** (same file, the breadcrumb + `<h1>` block) gains two conditional badges next to the case subject title — see "Header badges" below. These render regardless of which tab is active, since they're in the shared header, not inside the tab content.

## New component: `CaseOverviewPanel`

Location: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx`, following the sibling naming convention (`CaseTasksPanel.tsx`, `OpenCasesEmailsChat.tsx`).

Props: `caseId: number`, `selectedCase: Case` (already loaded by the parent — reused, not refetched).

### Layout — 50/50 two-column (approved mockup)

```
┌─────────────────────────────────────────────┐
│  Follow-up banner (only if a follow-up date  │
│  is set — reuses getFollowupStatus styling)  │
├───────────────────────┬──────────────────────┤
│  Tasks                │  Notes               │
│  (all, scrollable)    │  (full text)         │
│                       │                       │
│  Emails               │  Tags                │
│  (5 most recent,      │  (chips, filtered)   │
│   "View all" link)    │                       │
└───────────────────────┴──────────────────────┘
```

### Left column — Tasks card

- Fetches via the existing `useTaskList` hook / `list_tasks_for_case` command (same source `CaseTasksPanel` uses) — no new backend work.
- Renders **every** task, one line each: status dot (reusing `STATUS_OPTION_COLORS`, same dot+halo styling as `TaskRow`) + title (truncated) + due date, if the task has one (omitted otherwise — same conditional-rendering rule `TaskRow` already uses for its due-date line, not a placeholder). Card scrolls internally past a max height (e.g. ~6 rows visible, same idea as the description-line clamp pattern elsewhere in this codebase) rather than growing the whole page unbounded.
- Read-only: no status dropdown, edit/delete buttons, drag handle, or description expand. This is a new lightweight row, not a reuse of `TaskRow` (which is built for full interactive management and would be too heavy here).
- Empty state: reuse `"No tasks for this case yet."` (same copy `CaseTasksPanel` uses today).
- Card header includes a "View all →" link that calls the existing `onTabChange`-style callback to switch `activeRightTab` to `"tasks"`.

### Left column — Emails card

- New fetch: `invoke<CaseEmail[]>("list_case_emails", { caseId })` (existing command, currently only called from `OpenCasesEmailsChat.tsx` — this is a second caller, not a new command).
- Take the 5 most recent by `received_at` descending; render sender, subject, relative/short date — no click-to-expand, no attachments, no HTML body (that stays on the Emails tab).
- Empty state: reuse the existing `no_emails` i18n key (`"No email correspondence found for this case."`).
- Card header includes a "View all →" link switching to `activeRightTab = "emails"`.
- Fetch failure: show an inline error message inside the card only (matching `CaseTasksPanel`'s existing partial-failure pattern) — a failed email fetch must not blank out the rest of the Overview.

### Right column — Notes card

- Reads `selectedCase.notes` directly — already denormalized onto the `Case` object by `list_cases`, no new fetch.
- Shows the **full** note text (unlike the existing 2-line-truncated version in `OpenDocumentsPanelTopMenu.tsx`, which is left as-is).
- Read-only. No inline edit affordance — editing continues through the existing "Edit case notes & tags" kebab action.
- Empty state: small muted "No notes for this case yet." (new copy, same tone as existing empty-state strings).

### Right column — Tags card

- Reads `selectedCase.tags` directly — already denormalized, no new fetch.
- Renders as chips via the existing `TagChip` component (read-only mode — no `onRemove` passed).
- **Filters out** the `type` and `followup` tags (each already gets dedicated treatment: `type` in the header badge, `followup` in the banner above) — same filtering precedent as `OpenCasesDocumentsPanelTopMenu.tsx`, which already excludes `followup` from its chip list.
- Empty state: small muted "No tags for this case." (new copy).

## Header badges (visible on every tab)

In `CaseManagementOpenCasesDetails.tsx`'s header block, next to `selectedCase.subject`:

1. **Case type badge** — find `selectedCase.tags.find(t => t.name === "type")`, resolve its `value` through `CASE_TYPE_OPTIONS` to get the `labelKey`, render the translated label (e.g. "Family Law"). **Hidden entirely** if no `type` tag exists (cases created before this feature, or left blank).
2. **Needs-follow-up badge** — find the `followup` tag, run its value through the existing `getFollowupStatus`. Badge renders **only** when status is `"overdue"` or `"due-today"` — a comfortably-future pending follow-up does not surface a header badge (avoids every case-with-a-follow-up-date showing a permanent badge; the full pending/due-today/overdue detail is still visible in the Overview banner itself).

## Data flow summary

| Data | Source | New fetch? |
|---|---|---|
| Tasks | `list_tasks_for_case` via `useTaskList` | No — reuses existing hook |
| Emails | `list_case_emails` | New call site, existing command |
| Notes | `selectedCase.notes` | No — already on `Case` |
| Tags | `selectedCase.tags` | No — already on `Case` |
| Case type | `selectedCase.tags` (`type`) + `CASE_TYPE_OPTIONS` | No — client-side lookup |
| Follow-up | `selectedCase.tags` (`followup`) + `getFollowupStatus` | No — client-side lookup |

## Error handling

- Task fetch failure: `useTaskList`'s existing error state renders inline in the Tasks card (same pattern `CaseTasksPanel` already uses).
- Email fetch failure: local `try/catch` around the new `list_case_emails` call, inline error text in the Emails card only.
- Missing/absent data (no tasks, no emails, no notes, no tags, no follow-up, no case type) each degrade independently to their own empty state or hidden element — never blocks the rest of the panel from rendering.

## Verification

No existing frontend test harness in this repo (verification throughout this project has been manual: `tsc --noEmit` + running the app). Verify by:
- `npx tsc --noEmit` clean.
- Manually loading a case with tasks, emails, notes, tags, a case type, and a follow-up date set — confirm all six sections render.
- Manually loading a case missing each of those independently — confirm each empty state / hidden-badge behaves correctly and nothing else breaks.
- Confirm clicking a document while on Overview still opens document preview correctly (the `"preview"` state's existing trigger path is unchanged).
