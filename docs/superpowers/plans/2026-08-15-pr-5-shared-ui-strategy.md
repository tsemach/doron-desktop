# Shared UI strategy Implementation Plan

> **For agentic workers:** this plan produces documentation only — no
> application code, no dependency changes, no tests to write or run. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve ASC-105 sub-project #5 — decide what belongs in
`packages/ui`, fix the two correctness bugs already present (theme-token
drift, incompatible dual `Button`), and verify (not assume) that desktop
can consume the package — with a written decision a future implementation
PR can build directly against.

**Architecture:** Not applicable — this PR adds one design doc
(`docs/superpowers/specs/2026-08-15-pr-5-shared-ui-strategy-design.md`)
and this companion plan doc.

**Tech Stack:** N/A — Markdown only.

## Global Constraints

- No code, dependency, or config changes in this PR — the desktop-consumer
  Vite spike, theme-token copy, and Button migration are all *designed*
  here, not executed. They belong to whichever PR implements this design.
- Base branch is `master` — unlike PR-3 (which had to base on PR-1's
  branch because `docs/superpowers/` didn't exist on master yet), this PR
  only *adds* new files, so it has no such dependency.

---

### Task 1: Write the PR-5 design doc

**Files:**
- Create: `docs/superpowers/specs/2026-08-15-pr-5-shared-ui-strategy-design.md`

- [x] **Step 1: Write the doc.** Header (Linear issue: ASC-105 directly,
  "Sub-project 5 of 6" — matching PR-1/PR-3's convention of not creating
  separate Linear sub-issues), `## ASC-105 decomposition` list (updated to
  reflect PR-3's decision and PR-4 being moot), Background (packages/ui's
  actual scope, the dual-Button/theme-drift bugs, the dashboard cards'
  deliberate non-sharing, the `lucide-react` version-split risk), Goals,
  Non-goals, Decision (4 subsections: spike-first, theme fix, Button
  canonicalization, scope boundary), Edge cases, Open risks/follow-ups,
  What this unblocks.

- [x] **Step 2: Verify all factual claims against the actual codebase**,
  not assumption — done via two research passes (initial survey +
  independent validation pass) before writing, cross-checking exact call
  site counts (19, not an earlier guess of 16), exact token values, and
  which of backend's/office's comments are actually false vs. true.

---

### Task 2: Write this companion plan doc

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-pr-5-shared-ui-strategy.md` (this file)

- [x] **Step 1: Write it**, mirroring PR-3's plan.md format.

---

### Task 3: Commit, push, open PR

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers
git commit -m "Add PR-5 shared UI strategy decision doc"
```

- [ ] **Step 2: Push**

```bash
git push -u origin tsemachmizrachi/asc-105-pr-5-shared-ui-strategy
```

- [ ] **Step 3: Open the PR**

Base: `master`. Title: `[ASC-105] Shared UI strategy (PR-5)`, matching the
`(PR-3)`/`(PR-2.5)` suffix convention already used on PRs #160/#161.

- [ ] **Step 4: Confirm Linear auto-attachment**

Branch name contains `asc-105`, so Linear's GitHub integration should
auto-attach the PR to the ASC-105 issue, same as PRs #158/#159/#160/#161.
Verify via `mcp__linear-server__get_issue` (check the `attachments` list)
after push.

## Spec coverage check

- Decision doc (background, goals, non-goals, 4-part decision, edge cases,
  open risks, what this unblocks) — Task 1.
- Companion plan doc — Task 2.
- Branch/PR workflow (base on master, correct title, Linear auto-attach) —
  Task 3.
