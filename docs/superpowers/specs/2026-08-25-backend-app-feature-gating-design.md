# Backend `/app` feature gating — design spec

## Context

`apps/backend`'s `/app` section (Home, Cases, Calendar, Documents, Billing — the logged-in web portal, distinct from the marketing site and distinct from `apps/desktop`'s own unrelated feature-gate system in `apps/desktop/src/lib/featureGating.ts`) currently has no gating mechanism at all beyond auth. Every route is unconditionally reachable to any logged-in user; `billing/page.tsx` hardcodes `<ComingSoon featureKey="nav_billing" />` as a one-off stub rather than going through any general mechanism.

Structure today (`apps/backend/app/app/`):
- `layout.tsx` — session check (`redirect("/login")` if unauthenticated), renders `AppTopBar` → `AppNavMenu`
- `page.tsx` — Home: tiles for Cases/Documents/Calendar, "Recent Cases", "Documents Management", "Overview" (open tasks/follow-ups/needs case assignment), "Today's Meetings"
- `cases/page.tsx`, `cases/[id]/page.tsx`, `cases/templates/page.tsx`
- `calendar/page.tsx`
- `documents/page.tsx`, `documents/scan/page.tsx`, `documents/templates/page.tsx`
- `billing/page.tsx` — stub, `<ComingSoon>` only

`AppNavMenu.tsx` declares nav items as a flat array (`{labelKey, href, icon}`), no per-item gating today.

`middlewareLogic.ts` unconditionally redirects a logged-in user hitting `/` to `/app` (and rewrites an unauthenticated `/` to the public marketing `/home`).

## Goal

A hardcoded, per-feature enable/disable switch for the `/app` section, with a clean seam to swap the hardcoded source for a real online feature-gate service later without touching call sites.

## Non-goals

- No third gate state. Considered and rejected — see "Rejected: three-state gate" below.
- No per-tier (free/pro) dimension. This gate is a flat on/off per feature, unrelated to subscription tier.
- Not touching `apps/desktop`'s own feature-gate system — separate app, separate mechanism, out of scope.
- Not gating individual UI controls within a page (e.g. a single button) — granularity is nav-section level only (`app`, `cases`, `calendar`, `documents`, `billing`).

## Rejected: three-state gate

Initial design considered a third `"removed"` state (hide nav entirely, 404 on direct navigation) alongside `enabled`/`disabled`. Rejected on reconsideration: the added complexity (hiding nav items conditionally, `notFound()` handling, deciding what "removed" even means for the top-level `app` gate) wasn't worth it — a disabled feature's own page can already fully control what it shows, including looking like it doesn't exist, without a dedicated framework state for that. Two states only: `enabled` | `disabled`.

## Feature keys & states

New module: `apps/backend/lib/featureGating.ts`, following the existing convention in `apps/desktop/src/lib/featureGating.ts` (provider interface + local implementation + documented future swap-point), minus the tier dimension:

```ts
export type FeatureKey = "app" | "cases" | "calendar" | "documents" | "billing";
export type GateState = "enabled" | "disabled";

const FEATURE_GATES: Record<FeatureKey, GateState> = {
  app: "enabled",
  cases: "enabled",
  calendar: "enabled",
  documents: "enabled",
  billing: "disabled", // matches today's hardcoded ComingSoon stub
};

export interface FeatureGateProvider {
  getState(feature: FeatureKey): GateState;
}

class LocalFeatureGateProvider implements FeatureGateProvider {
  getState(feature: FeatureKey): GateState {
    return FEATURE_GATES[feature];
  }
}

// Swap point for a future online feature-gate service: implement
// FeatureGateProvider against it and point featureGateProvider here instead
// (mirrors apps/desktop/src/lib/featureGating.ts's Statsig swap-point comment).

export const featureGateProvider: FeatureGateProvider = new LocalFeatureGateProvider();

export function getFeatureState(feature: FeatureKey): GateState {
  return featureGateProvider.getState(feature);
}

export function isFeatureEnabled(feature: FeatureKey): boolean {
  return getFeatureState(feature) === "enabled";
}
```

`"app"` is the top-level gate for the entire `/app` section (Home included). `"cases" | "calendar" | "documents" | "billing"` are independent per-section gates underneath it — a section can be disabled while `"app"` stays enabled, and vice versa (if `"app"` is disabled, its layout short-circuits before any sub-route is reached, so sub-gates become moot).

## Enforcement: per-section `layout.tsx`

Considered three placements — middleware (central but can't cleanly render a React placeholder for `disabled`, only redirect/rewrite), per-page duplicated checks (matches the existing duplicated-`auth()`-per-page convention, but means touching 8 files today and every new page forever), and per-section `layout.tsx` (one choke point per section, covers all sub-routes automatically, renders `ComingSoon` cleanly). Going with **per-section `layout.tsx`** — a deliberate, justified deviation from the per-page-auth-duplication convention, because it structurally can't be forgotten on a new sub-route the way a duplicated check can.

New files: `cases/layout.tsx`, `calendar/layout.tsx`, `documents/layout.tsx`, `billing/layout.tsx` (none exist today — only page.tsx per section). Each:

```tsx
export default function CasesLayout({ children }: { children: React.ReactNode }) {
  if (!isFeatureEnabled("cases")) {
    return <ComingSoon featureKey="nav_cases" />;
  }
  return children;
}
```

Same pattern for `calendar`/`documents`/`billing`, each with their own `labelKey`. When disabled, Next.js never renders `{children}` — so the real `page.tsx` (and any sub-route page beneath it, e.g. `cases/[id]/page.tsx`, `documents/scan/page.tsx`) never executes, including their data fetches (`listVisibleCases`, etc.).

`billing/page.tsx`'s current hardcoded `<ComingSoon featureKey="nav_billing" />` is deleted; `billing/layout.tsx` + `billing: "disabled"` in the config takes over, unifying billing under the same mechanism instead of remaining a special case.

The existing `app/app/layout.tsx` gets the same check added (in addition to its existing session-check logic) for the top-level `"app"` key:

```tsx
if (!isFeatureEnabled("app")) {
  return <ComingSoon featureKey="nav_home" />; // or app-level copy — see open item below
}
```

## Nav (`AppNavMenu.tsx`)

No change to which items render — nav items are always shown regardless of gate state (two-state design has no "hide" concept). A `disabled` section's nav link still works; it just lands on that section's `ComingSoon` placeholder instead of real content.

## Home page (`app/app/page.tsx`)

Tiles for Cases/Documents/Calendar are always shown (consistent with "nav always shown"). The live-data panels tied to a disabled feature — "Recent Cases" (tied to `cases`), "Documents Management" (tied to `documents`) — are hidden when that feature is `disabled`, since showing live data previews for an off feature is misleading; the "Overview" panel (open tasks/follow-ups/needs-case-assignment, all case-derived) and "Today's Meetings" (calendar-derived) follow the same rule against their respective feature keys.

## Login redirect (`middlewareLogic.ts`)

Today: `"/"` unconditionally redirects a logged-in user to `/app`. Changes to: redirect only when `isFeatureEnabled("app")`; when `"app"` is `disabled`, falls through to the same `/home` marketing page an unauthenticated user sees today — no new route, no special-casing beyond the added condition.

## Open item for implementation time

Exact copy/wording for the top-level `"app"`-disabled placeholder (vs. per-section copy) isn't pinned down — reuse `ComingSoon`'s existing `featureKey`-driven translation lookup, pick a sensible key (e.g. a new `nav_home` or `app_disabled` translation entry) when implementing.
