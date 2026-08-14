# Cases/documents data-ownership decision Implementation Plan

> **For agentic workers:** this plan produces documentation only — no
> application code, no schema migration, no tests to write or run. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve ASC-105's open question — "where do cases/documents live" —
with a written decision (backend Postgres vs. desktop-local vs. hybrid) that
sub-project #4 (offline + two-way sync) and #5 (shared UI strategy) can build
against.

**Architecture:** Not applicable — this PR adds one design doc
(`docs/superpowers/specs/2026-08-13-pr-3-cases-documents-data-ownership-design.md`)
and this companion plan doc, and renames sub-project #1's existing spec/plan
pair to include its PR number for naming consistency.

**Tech Stack:** N/A — Markdown only.

## Global Constraints

- No code, schema, or config changes in this PR — anything that looks like
  an implementation task (schema migration, sync endpoint, desktop changes)
  belongs to sub-project #4's own future plan doc, not this one.
- Base branch is PR-1's branch
  (`tsemachmizrachi/asc-105-add-user-area-in-the-backend`, GitHub PR #158),
  not `master` — `master` doesn't yet contain the `docs/superpowers/`
  files this PR renames, since PR-1 is still open.

---

### Task 1: Rename sub-project #1's spec/plan files to include their PR number

**Files:**
- Rename: `docs/superpowers/specs/2026-08-10-private-area-shell-entry-point-design.md` → `docs/superpowers/specs/2026-08-10-pr-1-private-area-shell-entry-point-design.md`
- Rename: `docs/superpowers/plans/2026-08-10-private-area-shell-entry-point.md` → `docs/superpowers/plans/2026-08-10-pr-1-private-area-shell-entry-point.md`

- [x] **Step 1: Rename via `git mv`** (preserves history as a rename, not
  delete+add)

```bash
git mv docs/superpowers/specs/2026-08-10-private-area-shell-entry-point-design.md docs/superpowers/specs/2026-08-10-pr-1-private-area-shell-entry-point-design.md
git mv docs/superpowers/plans/2026-08-10-private-area-shell-entry-point.md docs/superpowers/plans/2026-08-10-pr-1-private-area-shell-entry-point.md
```

- [x] **Step 2: Confirm no internal references to the old filenames need
  updating**

```bash
grep -rn "2026-08-10-private-area-shell-entry-point" docs/
```
Expected: no hits (confirmed clean).

---

### Task 2: Write the PR-3 design doc

**Files:**
- Create: `docs/superpowers/specs/2026-08-13-pr-3-cases-documents-data-ownership-design.md`

- [x] **Step 1: Write the doc (original version)**

Original content: header (Linear issue/status/date/decomposition position),
Background (desktop/backend ground truth + the stated privacy/offline
constraints + the tension with ASC-105's SaaS goal), Goals, Non-goals,
Decision (Options A/B/C, recommending C — hybrid, full content stays local,
a narrow case-summary layer pushes to backend), an illustrative
`case_summaries` shape, Edge cases, and "What this unblocks."

- [x] **Step 2: Verify referenced file paths/type names are accurate**

The design doc references `apps/backend/lib/dashboard/types.ts`'s
`ImportantTask`/`EmailArrival`/`BillingSummary`/`CaseSummary` types (they
live on the not-yet-merged pr-2/pr-2.5 dashboard branch, not this one) —
confirmed by reading that file directly in the pr-2 worktree rather than
assuming the path/names.

- [x] **Step 3: Revise the decision after new user direction (2026-08-15)**

The user gave a more specific, different direction than the original
case-summary hybrid: desktop stays sole source of truth including full
document content; an opt-in Settings toggle enables one-directional
background "Cloud Backup" to Postgres/Vercel Blob; restore is explicitly
out of scope for ASC-105. Rewrote the doc's Decision section (and Goals/
Non-goals) to cover: prior art already in this codebase to reuse
(`versioning.rs`'s per-open-case watcher, the email poller's interval+
`MissedTickBehavior::Delay` pattern, the settings-table pattern, the
`apps/office` Blob-upload shape, `authorizeDesktopToken`'s body-token
auth), a two-mechanism change-detection design (fast per-open-case watcher
+ rare all-cases safety-net scan — validated against a "isn't a full
walkdir every few minutes wasteful?" question, which was correct and
changed the scan cadence from every-5-minutes to hourly), a concrete
parameter table, upload-path/schema/settings design, edge cases, and named
open risks (>4MB files, retry tuning, telemetry).

---

### Task 3: Write this companion plan doc

**Files:**
- Create: `docs/superpowers/plans/2026-08-13-pr-3-cases-documents-data-ownership.md` (this file)

- [x] **Step 1: Write it**, mirroring PR-1's plan.md format.

---

### Task 4: Commit, push, open PR

- [x] **Step 1: Stage and commit**

```bash
git add docs/superpowers
git commit -m "Add PR-3 data-ownership decision doc, rename PR-1 spec/plan to include PR number"
```

- [x] **Step 2: Push**

```bash
git push -u origin tsemachmizrachi/asc-105-pr-3-cases-documents-data-ownership
```

- [x] **Step 3: Open the PR**

Opened as GitHub PR #161. Base: `tsemachmizrachi/asc-105-add-user-area-in-the-backend`
(PR-1's branch, not `master` — same reasoning as the Global Constraints
note above; once PR-1 merges, GitHub will retarget this PR's base
automatically and the diff will shrink to just this PR's own new files +
the two renames). Title: `[ASC-105] Cases/documents data-ownership decision
(PR-3)`, matching the `(PR-2.5)` suffix convention already used on PR #160.

- [x] **Step 4: Confirm Linear auto-attachment**

Confirmed via `mcp__linear-server__get_issue` — PR #161 appears in the
ASC-105 issue's `attachments` list alongside #158/#159/#160, no manual
Linear action needed.

---

### Task 5: Revise PR #161 in place with the new decision

**Files:** same two files as Tasks 2/3, content replaced not renamed.

- [ ] **Step 1: Rewrite the design doc's Decision section** (see Task 2,
  Step 3 above for what changed) and update this plan doc.

- [ ] **Step 2: Commit as a new commit on the same branch** (not an amend/
  force-push, per this repo's git conventions)

```bash
git add docs/superpowers
git commit -m "Revise PR-3 decision: desktop stays source of truth, opt-in one-way cloud backup"
```

- [ ] **Step 3: Push** (updates PR #161 in place, no new PR)

```bash
git push origin tsemachmizrachi/asc-105-pr-3-cases-documents-data-ownership
```

- [ ] **Step 4: Update PR #161's description** to reflect the revised
  decision, via `gh api repos/tsemach/doron-desktop/pulls/161 -X PATCH -f
  body=...` (the REST-API-not-`gh pr edit` workaround already established
  in this repo for the GraphQL projects-classic error).

## Spec coverage check

- Rename with PR numbers — Task 1.
- Original decision doc (superseded) — Task 2.
- Companion plan doc — Task 3.
- Branch/PR workflow (base on PR-1's branch, correct title, Linear
  auto-attach) — Task 4.
- Revised decision doc + updated PR description — Task 5.
