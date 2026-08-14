# Shared UI strategy (packages/ui expansion) — design

**Linear issue:** [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend) — "Add user area in the backend"
**Status:** Sub-project 5 of 6 (see [ASC-105 decomposition](#asc-105-decomposition) below)
**Date:** 2026-08-15

## ASC-105 decomposition

1. **Private-area shell & entry point** — PR-1.
2. **Opening/dashboard page** — PR-2/PR-2.5.
3. **Cases/documents data-ownership decision** — PR-3. Decided: desktop
   stays the sole source of truth for case/document content,
   unconditionally; an opt-in one-directional Cloud Backup feature is the
   only thing that ever reaches the backend, and only as metadata pointing
   at Vercel Blob storage, never document content itself.
4. **Offline + two-way sync** — moot. PR-3's decision means there is
   nothing to bidirectionally sync: the backend is never an active source
   of truth for case/document content, so the two-way sync problem this
   sub-project was originally scoped around doesn't arise.
5. **Shared UI strategy** (`packages/ui` expansion) — this document.
6. **"Coming soon" gating for unbuilt features** — small, mechanical,
   depends on #1.

This document covers **#5 only**: a decision and its rationale, not
implementation.

## Background

`packages/ui` is real infrastructure already, just far smaller and
narrower than the general "shared UI" name suggests, and the codebase has
already diverged in places it claims not to have:

- **`packages/ui` is tiny and scoped only to auth pages.** `src/index.ts`
  exports exactly `Button`, `AuthCard`, `PasswordInput`, `cn()`, and
  `auth-form.ts`'s string constants (`labelClass`/`inputClass`/
  `errorClass`/`LOGIN_PASSWORD_LENGTH`). No build step — `package.json`'s
  `main`/`types` point straight at raw `src/index.ts`, the same raw-source
  pattern `packages/backend-orm` already uses (a repo convention, not a
  shortcut specific to this package).
- **Desktop does not consume `packages/ui` at all.** Zero imports under
  `apps/desktop/src`, no `@workspace/ui` dependency entry. Only
  `apps/backend` (12 files) and `apps/office` (4 files) consume it — every
  real usage is on auth/login-flow pages.
- **Two incompatible `Button` implementations already exist under the same
  design-system name.** `packages/ui/src/components/button.tsx`: plain
  `forwardRef`, 3 variants (default/outline/ghost), no sizes, hardcoded
  raw colors (`bg-blue-600`, `border-gray-300`). `apps/desktop/src/
  components/ui/button.tsx`: CVA + `radix-ui`'s `Slot.Root`, 6 variants +
  8 sizes + `asChild`, semantic tokens (`bg-primary`, `bg-destructive/10`),
  `data-slot`/`data-variant`/`data-size` attributes. Desktop's
  `components.json` declares shadcn style `radix-nova`; neither backend
  nor office has a `components.json` at all. **19 JSX `<Button` usages
  across 9 files** in backend+office would be affected by canonicalizing
  either direction.
- **Theme tokens have silently diverged despite a comment claiming
  parity.** `apps/backend/app/globals.css`'s comment claims *"Same
  design-token setup as apps/desktop/...globals.css"* — false today:
  desktop's `--foreground`/`--primary` use a hue-265 tint
  (`oklch(0.27 0.015 265)`), backend/office use zero-chroma neutral
  (`oklch(0.145 0 0)`). `apps/office/app/globals.css`'s comment instead
  (accurately) claims parity with *backend* — so there's one false
  comment, not two independently false ones.
- **No build-tooling precedent exists for Vite consuming `packages/ui`.**
  Next.js apps consume its raw TSX with zero special config (no
  `transpilePackages` anywhere in the repo) — this works because pnpm's
  workspace symlink resolves to a real path (`packages/ui/src/...`) not
  under `node_modules`, so the bundler's default node_modules-exclude
  transform rule never applies. Vite has the same symlink-realpath default
  (`resolve.preserveSymlinks: false`), so it *should* behave identically —
  but there is zero existing evidence of this in the repo; it's an
  assumption, not a confirmed fact.
- **The one concrete recent opportunity to share was built without
  sharing.** ASC-105's own dashboard glance cards (sub-project #2, PR
  #159/#160 — `apps/backend/components/app/dashboard/*.tsx`) have zero
  `@workspace/ui` imports; fully local, styled directly with shadcn
  semantic tokens. This reads as a deliberate choice — the fastest path to
  a fully-mocked, visually-distinctive dashboard, with no shared data
  model yet to justify the coordination cost — not an oversight.
- **Desktop already has independently-built, functionally-parallel
  equivalents** for the same concepts the dashboard cards cover (case
  list, task list, email list): `CaseManagement/CaseManagementOpenCases/
  OpenCasesList.tsx` (table rows, Tauri folder-opening, `react-router-dom`),
  `CaseTasksPanel.tsx` (full CRUD via `invoke()`, composing desktop's own
  `TaskList`/`TaskForm`). Zero code-sharing with backend's read-only
  dashboard cards; architecturally quite different (desktop: Tauri IPC +
  full CRUD; backend: read-only, currently mock per PR-3's decision).
- **`lucide-react` has already silently forked into two major versions**
  inside the monorepo — `packages/ui`/backend/office pin `^0.468.0`,
  desktop pins `^1.16.0` (`pnpm-lock.yaml` resolves both `0.468.0` and
  `1.18.0` today). `packages/ui`'s `PasswordInput` already imports
  `Eye`/`EyeOff` from it. Smaller version of the same drift:
  `tailwind-merge` (`^3.0.1` in `packages/ui` vs. `^3.6.0` in desktop).
- **`class-variance-authority` and `radix-ui` are dependencies of neither
  `apps/backend` nor `apps/office` today.**
- **PR-3's decision matters directly here.** Desktop stays sole source of
  truth; backend only ever gets thin, opt-in metadata. Backend's and
  desktop's data-fetching will stay fundamentally different (Tauri
  `invoke()` vs. Next.js API routes/DB queries) even for visually-similar
  concepts. This document is scoped to presentation-layer sharing only,
  not data-layer sharing.

## Goals

- Make the "same design-token setup" comment already sitting in
  `globals.css` true, not aspirational.
- Resolve the two incompatible `Button`s to one canonical implementation.
- Establish desktop as a technically-*verified* `packages/ui` consumer —
  currently zero consumption, zero precedent, an assumption not a fact.
- Define an explicit, narrow scope boundary for what belongs in
  `packages/ui` going forward, so future PRs don't re-litigate it each time.

## Non-goals (explicitly deferred)

- No retroactive migration of desktop's existing business components
  (`TaskList`, `CaseStatusBadge`, `PdfViewer`, etc.) into `packages/ui`.
- No retrofit of the already-shipped dashboard glance cards to consume
  shared components.
- No data-bound / cross-app component sharing between desktop and
  backend — PR-3's decision means their data-fetching stays fundamentally
  different even where the visual concept overlaps.
- No repo-wide dependency-version reconciliation — the `lucide-react`
  0.468.0/1.18.0 split and `tailwind-merge` drift are named, deliberately
  deferred, not this sub-project's job to unify.
- No build step / bundling pipeline for `packages/ui` — stays raw-`src`
  per the existing `packages/backend-orm` precedent, unless the
  desktop-consumer spike below proves that's actually necessary.
- Any code changes in this PR itself — this is a decision document.

## Decision

**Narrow, pragmatic scope: fix the two correctness bugs already present
(theme drift, dual Button), verify — not assume — that desktop can consume
`packages/ui`, and formalize the scope boundary the codebase has already
organically settled on: generic presentational primitives only, no
business/data-bound components.** Sequenced spike-first, since the spike
gates whether the rest of this has any payoff at all.

### 1. Desktop-as-consumer spike (prerequisite — do this first)

Add `@workspace/ui` to `apps/desktop/package.json` and confirm Vite
actually handles it the way Next.js already does, rather than assuming it.
Concrete acceptance criteria:

- `pnpm desktop:dev` picks up HMR edits made inside `packages/ui/src` (not
  just a full reload).
- `pnpm --filter desktop build` (the real `vite build`, not just
  `tsc --noEmit`) succeeds and the JSX inside `packages/ui`'s components is
  actually transformed — not shipped as raw JSX syntax, which would be a
  silent runtime crash rather than a build-time error if `optimizeDeps`
  mishandles it.
- No duplicate-version bundle bloat from packages both `packages/ui` and
  desktop already depend on (`clsx`, `tailwind-merge`).
- Desktop's `@` alias (currently `./src` only) doesn't need to change —
  `packages/ui`'s components use relative imports internally, so this
  should be a non-issue, but confirm rather than assume.

If this reveals a real blocker (e.g. `vite.config.ts` needs an explicit
`optimizeDeps.include`/`exclude` entry), that becomes an in-scope task to
name, not a silent surprise for whoever implements this next.

### 2. Theme token fix

Desktop's `:root`/`.dark` OKLCH block becomes the single source of truth,
copied byte-for-byte into both `apps/backend/app/globals.css` and
`apps/office/app/globals.css`. Backend's comment (the one that's currently
false) gets corrected; office's comment (currently true, since it claims
parity with backend) stays accurate by construction once backend matches
desktop too.

### 3. Button canonicalization

Desktop's CVA + `Slot` + semantic-token version becomes canonical, moved
into `packages/ui`. This is the single largest concrete task in the whole
sub-project — sized and called out as such, not folded into "fix two bugs"
as if it were equal-effort to the theme change:

- Two new deps added to `packages/ui/package.json`:
  `class-variance-authority`, `radix-ui`.
- A migration pass over the 9 files / 19 call sites in backend+office.
- **The two fixes compound, not just add.** After the theme fix, the old
  Button's hardcoded `bg-blue-600` under `variant="default"` already
  visually diverges from `bg-primary`; the CVA rewrite additionally
  changes unconditional `px-4 py-2` padding to a sized default of
  `h-8 px-2.5`. Every one of the 19 call sites needs a visual QA pass, not
  an assumption that "same variant name" means "same rendered result."
  Variant names are otherwise a safe superset (old: default/outline/ghost;
  new adds secondary/destructive/link) — no coverage gap there.

### 4. Scope boundary going forward

`packages/ui` stays limited to generic, **logic-free** (operationally: no
I/O — no data fetching, no app-specific routing/`invoke()`/API calls; may
hold local UI-only state, e.g. `PasswordInput`'s visibility toggle already
does) presentational primitives and design tokens — button, and whichever
of input/card/dialog/badge/select prove genuinely needed by 2+ apps
(matching `PLAN.md`'s original, narrower auth-page-scoped aspiration, now
generalized). Feature/business components with app-specific data-fetching
stay local to each app — the pattern both the dashboard cards and
desktop's `ui/` folder already organically follow.

## Edge cases

- A Button call site relying on the old version's exact `outline` styling
  (`border-gray-300`/`hover:bg-gray-100`, raw grays) inherits the new
  version's token-based `border-border` — flag as a required visual QA
  pass, not an assumed-identical swap.
- Desktop's `radix-ui` import style (`Slot.Root` from the unified
  `radix-ui` package) vs. the more common per-component
  `@radix-ui/react-slot` — confirm `packages/ui`'s new `radix-ui`
  dependency doesn't create a second, parallel Radix package family if a
  future component wants an individual `@radix-ui/react-*` package.
- If the Vite spike surfaces an `optimizeDeps` requirement, that's a
  `vite.config.ts` change with no prior precedent in this repo — treat as
  an in-scope task if discovered, not a follow-up to punt.

## Open risks / follow-ups

- `lucide-react` major-version split (`0.468.0` vs. `1.18.0`, already
  coexisting via pnpm) and `tailwind-merge` minor drift — named,
  deliberately deferred, not solved here.
- No multi-brand/white-label theming exists or is being introduced —
  office and backend intentionally share desktop's exact tokens with no
  per-app override mechanism; a real constraint if office ever needs a
  visually distinct look.
- `packages/ui` staying build-step-free is a bet valid only as long as the
  desktop-consumer spike confirms Vite handles it like Next.js does; a
  future component needing something the raw-transform approach can't
  handle (CSS-in-JS extraction, a non-JSX asset pipeline) would reopen
  that question — explicitly not solved now.

## What this unblocks

- Future sub-projects/PRs needing a second or third shared primitive
  (input/card/dialog/badge/select) have a settled scope boundary and a
  *proven* Vite-consumption path to build against, instead of re-deciding
  both per PR.
- Desktop and backend/office visually converge on one theme and one
  Button, closing the gap between the existing "same shadcn/ui theme"
  comment and reality.
- Confirms — matching PR-3's own "what this unblocks" framing — that
  deeper component sharing (desktop's `TaskList`, `CaseStatusBadge`, etc.)
  stays correctly out of scope until/unless a future decision changes
  backend's and desktop's data-fetching mechanics to actually converge,
  which PR-3 already ruled out for case/document content specifically.
