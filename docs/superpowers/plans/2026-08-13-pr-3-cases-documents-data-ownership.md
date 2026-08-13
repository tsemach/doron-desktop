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

- [x] **Step 1: Write the doc**

Content: header (Linear issue/status/date/decomposition position),
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

---

### Task 3: Write this companion plan doc

**Files:**
- Create: `docs/superpowers/plans/2026-08-13-pr-3-cases-documents-data-ownership.md` (this file)

- [x] **Step 1: Write it**, mirroring PR-1's plan.md format.

---

### Task 4: Commit, push, open PR

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers
git commit -m "Add PR-3 data-ownership decision doc, rename PR-1 spec/plan to include PR number"
```

- [ ] **Step 2: Push**

```bash
git push -u origin tsemachmizrachi/asc-105-pr-3-cases-documents-data-ownership
```

- [ ] **Step 3: Open the PR**

Base: `tsemachmizrachi/asc-105-add-user-area-in-the-backend` (PR-1's branch,
not `master` — same reasoning as the Global Constraints note above; once
PR-1 merges, GitHub will retarget this PR's base automatically and the diff
will shrink to just this PR's own two new files + the two renames).
Title: `[ASC-105] Cases/documents data-ownership decision (PR-3)`, matching
the `(PR-2.5)` suffix convention already used on PR #160.

- [ ] **Step 4: Confirm Linear auto-attachment**

Branch name contains `asc-105`, so Linear's GitHub integration should
auto-attach the PR to the ASC-105 issue, same as PRs #158/#159/#160. Verify
with `gh pr view <number> --json url` and a quick Linear check (issue
attachments list) after push — no manual Linear issue/comment needed.

## Spec coverage check

- Rename with PR numbers — Task 1.
- Decision doc (Options A/B/C, recommendation, illustrative schema, edge
  cases, what this unblocks) — Task 2.
- Companion plan doc — Task 3.
- Branch/PR workflow (base on PR-1's branch, correct title, Linear
  auto-attach) — Task 4.
