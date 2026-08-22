# Phase 2: Shared UI foundation — design

**Linear issue:** [ASC-182](https://linear.app/amicusx/issue/ASC-182) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
("Add fully backend support (SaaS)")
**Status:** Design — adopts [PR-5](../../superpowers/specs/2026-08-15-pr-5-shared-ui-strategy-design.md)
(ASC-105) as-is; re-verified against current code 2026-08-22, still fully
accurate. Not yet implemented.
**Date:** 2026-08-22

This document covers **Phase 2 only**, per
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) (PR-2,
stacked on PR-1).

## Context

Phase 2's scope, per the master plan, is: "Implements PR-5's already-decided,
not-yet-built design in full." PR-5 was written for ASC-105 (2026-08-15) but
never built. Rather than re-deciding shared-UI strategy from scratch, its
claims were re-verified against current code before adoption — every one
held exactly, including exact counts (19 `<Button` call sites across 9
files, theme token values, dependency versions, absence of
`class-variance-authority`/`radix-ui` from backend/office). **This document
is a thin adoption + implementation-ordering layer on top of PR-5, not a
new design** — PR-5 itself remains the authority on rationale/scope.

## Goals

- Execute PR-5's four-part plan, in its stated order (the spike gates
  whether the rest has payoff at all): desktop-as-consumer spike, theme
  token fix, Button canonicalization, scope-boundary formalization.
- Unblock Phase 3, which needs `packages/ui`'s shared primitives and a
  unified theme to build Cases/Tasks/Calendar/Templates against.

## Non-goals

Inherits PR-5's non-goals as-is: no retroactive migration of desktop's
business components (`TaskList`, `CaseStatusBadge`, `PdfViewer`, etc.) into
`packages/ui`, no retrofit of the already-shipped dashboard glance cards, no
data-bound/cross-app component sharing, no repo-wide `lucide-react`/
`tailwind-merge` version reconciliation, no build step for `packages/ui`
unless the spike proves one necessary. Additionally, per this stack's own
convention (matching PR-0/PR-1): **no actual code changes in this PR** —
implementation is a follow-up PR once this design is approved.

## Adopted plan (from PR-5, verified current as of 2026-08-22)

1. **Desktop-as-consumer spike** (prerequisite): add `@workspace/ui` to
   `apps/desktop/package.json`, confirm Vite HMR picks up edits inside
   `packages/ui/src`, confirm `pnpm --filter desktop build` actually
   transforms the JSX (not a silent runtime crash), confirm no
   duplicate-version bundle bloat for `clsx`/`tailwind-merge`.
2. **Theme token fix**: desktop's `:root`/`.dark` OKLCH block (hue-265
   tinted — `--foreground: oklch(0.27 0.015 265)`,
   `--primary: oklch(0.3 0.02 265)`) becomes the single source of truth,
   copied into `apps/backend/app/globals.css` and
   `apps/office/app/globals.css` (currently zero-chroma neutral,
   `oklch(0.145 0 0)`/`oklch(0.205 0 0)`, identical to each other).
3. **Button canonicalization**: desktop's CVA + `Slot.Root` version (6
   variants, 8 sizes, semantic tokens, `data-slot`/`data-variant`/
   `data-size`, `asChild`) replaces `packages/ui`'s current `forwardRef`
   version (3 variants, no sizes, hardcoded `bg-blue-600`/
   `border-gray-300`) — migrating all 19 call sites across 9 files (11 in
   `apps/backend`: `register/complete`, `download`×2, `login`×3,
   `checkout/mock`, `accept-invite`, `register`×3; 8 in `apps/office`:
   `login`×3, `register`, `OfficeSidebar`×4). Every call site needs a
   visual QA pass, not an assumed-identical swap (variant names are a safe
   superset, but padding/border-color changes even where a variant name
   matches).
4. **Scope boundary**: `packages/ui` stays limited to generic, logic-free
   presentational primitives — button, plus whichever of
   input/card/dialog/badge/select prove genuinely needed by 2+ apps.
   Feature/business components stay local to each app.

## Two implementation details surfaced by re-verification (not in original PR-5)

- **Tailwind v4 content-scanning gap for desktop.** Backend's and office's
  `globals.css` already have `@source "../../../packages/ui/src"` so
  `packages/ui`'s Tailwind classes actually generate in those Next.js
  builds. Desktop's `globals.css` has no equivalent `@source` line. The
  spike (step 1) must confirm whether Vite + Tailwind v4 needs the same
  addition for desktop, or resolves content-scanning differently for a
  non-Next bundler — added as an explicit spike acceptance criterion, not
  assumed away.
- **Backend has marketing-only tokens PR-5 didn't flag.** `apps/backend
  /app/globals.css` defines `--brand-accent`/`--brand-accent-foreground`
  and `--font-display`/`--font-heading`, used by the public marketing
  pages, absent from desktop's and office's token sets. The theme-token
  fix (step 2) must preserve these when copying over desktop's shared
  block, not overwrite/delete them — copying desktop's block wholesale
  without checking for this would silently break the marketing site's
  styling.

## What this unblocks

Phase 3's Cases/Tasks/Calendar/Templates pages consume `packages/ui`'s
canonical Button and the unified theme directly, rather than building
one-off styling to visually match desktop by hand.
