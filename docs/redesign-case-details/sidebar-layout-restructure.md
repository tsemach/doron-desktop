# Case Detail Sidebar — Layout Restructure

## Problem

`CaseManagement.tsx` renders `CaseManagementSidebar` and the route `<Routes>`
block as flat siblings inside one `<div>`:

```tsx
<div className="flex h-screen relative w-full overflow-hidden">
  <CaseManagementSidebar />
  <Routes>
    <Route path="/" element={<CaseManagementOpenCases />} />
    <Route path="templates" element={<CasesManagementTemplate />} />
    <Route path="task-templates" element={<CasesManagementTaskTemplate />} />
    <Route path="new-case" element={<CaseManagementCaseCreate />} />
    <Route path="cases/:caseId" element={<CaseManagementOpenCasesDetails />} />
  </Routes>
  <CaseManagementEmailAlertReview />
</div>
```

Because the sidebar is a single fixed sibling of the whole `<Routes>` block
(not per-route), every route under `/case-management/*` — including the case
detail view at `cases/:caseId` — gets the same left navigation sidebar
(Main / Open Cases / New Case / Case Templates / Task Templates). There is no
route-level seam that lets the detail view render a different sidebar.

The app has no existing precedent for a route-specific sidebar: no route
anywhere uses React Router's layout-route + `<Outlet>` nesting today — all
routes (`AppMain.tsx`, `CaseManagement.tsx`) are flat `element={...}` routes.

## Goal

Restructure the route tree so `cases/:caseId` is structurally isolated from
the list-view routes, in preparation for eventually giving the case detail
page its own, different sidebar — without designing that new sidebar's
content yet (plumbing only).

## Design

Introduce two small layout components using React Router's layout-route +
`<Outlet>` pattern, splitting the route tree into a "list views" group and a
"case detail" group:

```tsx
<Routes>
  <Route element={<CaseManagementListLayout />}>
    <Route path="/" element={<CaseManagementOpenCases />} />
    <Route path="templates" element={<CasesManagementTemplate />} />
    <Route path="task-templates" element={<CasesManagementTaskTemplate />} />
    <Route path="new-case" element={<CaseManagementCaseCreate />} />
  </Route>
  <Route element={<CaseDetailLayout />}>
    <Route path="cases/:caseId" element={<CaseManagementOpenCasesDetails />} />
  </Route>
</Routes>
```

### New files

- **`CaseManagementListLayout.tsx`** — renders `<CaseManagementSidebar />` +
  `<Outlet />`. Used only by the four list-view routes (`/`, `templates`,
  `task-templates`, `new-case`).
- **`CaseDetailLayout.tsx`** — renders `<CaseManagementSidebar />` +
  `<Outlet />` too, for now — same sidebar, just wrapped in its own layout
  component. This is the seam: swapping in a different sidebar later means
  editing only this one file, touching nothing else.

Both files are tiny (~15 lines), one component per file, matching the
existing convention (`CasesManagementSidebar.tsx` is already its own file).

### Unchanged

- `CaseManagement.tsx`'s outer `<div className="flex h-screen ...">` wrapper
  stays as-is.
- `CaseManagementEmailAlertReview` stays rendered unconditionally as a
  sibling of `<Routes>` — it's not sidebar-related, no reason to move it.
- `CaseManagementSidebar` stays prop-less; it doesn't need to know which
  layout rendered it.

### Data flow

No change. `CaseManagementSidebar` currently takes no props and uses
`useNavigate()` / `useLocation()` for active-tab highlighting and
`useLanguage()` for i18n text — all of that continues to work unchanged in
both layouts.

### Testing

No unit tests exist for this component today. Verify manually that all five
routes still render correctly and that the sidebar's active-tab highlighting
still works (it depends on `useLocation()`, unaffected by this restructure).

## Follow-up (not part of this pass)

Once this plumbing is in place, a future change can replace
`CaseManagementSidebar` inside `CaseDetailLayout.tsx` with a new
case-detail-specific sidebar component, without touching the list-view
routes or `CaseManagementListLayout.tsx`.
