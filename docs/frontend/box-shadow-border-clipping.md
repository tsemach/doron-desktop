# Rounded-corner rendering pitfalls

Two distinct bugs in this codebase both show up as "the rounded border looks wrong,"
but have different causes and different fixes. Check the symptom carefully before
picking a fix — see [issue 2](#issue-2-native-select-corners-ignore-rounded--all-four-corners-look-square)
if the element is a `<select>` and *all four* corners look square, not just one edge.

## Issue 1: box-shadow border clipped inside a scroll container

### Symptom

A `rounded-*` element with a `border` (e.g. `rounded-lg border border-input`) is missing
one or more edges of its border when it sits inside a scrollable container — most often
the edge(s) flush against the container's boundary. Making the border thicker
(`border-2`) can make the missing edge partially reappear, which is a strong signal this
is the cause.

### Root cause

Two things stack:

1. **Borders are faked with `box-shadow`.** `apps/desktop/src/styles/globals.css`
   (~line 238) works around a WebView2/Chromium GPU bug where rounded bordered elements
   render diagonal artifacts on Windows 11. The fix forces `border-color: transparent`
   on any `rounded-*.border` element and paints the line with
   `box-shadow: 0 0 0 1px var(--border)` instead. This shadow is drawn *outside* the
   element's box, not as part of its layout box.

2. **`overflow-y-auto` (or `-x-auto`) clips that shadow if there's no matching padding.**
   Setting overflow on one axis implicitly sets the other axis to `auto` too (CSS spec
   behavior), so a container like `overflow-y-auto` also clips horizontally. If a child
   with the faked box-shadow border sits flush against the container edge (no padding on
   that side), the outward-painted 1px shadow falls outside the clip region and is
   invisible. A 2px border/shadow has more spread, so part of it can still survive the
   clip — which is why bumping border width "fixes" it, misleadingly.

### Fix

Give the scrolling container padding on every edge a bordered child can touch — `p-1`
(or equivalent) is enough for a 1px shadow-border to have room to render before hitting
the clip boundary. Don't just pad the edges you notice a problem on; pad all of them,
since any edge can clip once a child is flush against it.

Example fix applied in
`apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesCaseAnnotationsModal.tsx`
(~line 267):

```diff
- <div className="flex-grow flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
+ <div className="flex-grow flex flex-col gap-4 min-h-0 overflow-y-auto p-1">
```

(`pr-1` alone fixed the left edge but left the bottom edge of the last child — the Notes
textarea — clipped, since there was still no bottom padding.)

### How to spot other instances

Search for scroll containers that wrap rounded-bordered children flush to an edge:

```bash
grep -rn "overflow-y-auto\|overflow-x-auto" apps/desktop/src/components
```

For each match, check whether it has padding (`p-*`, `px-*`, `py-*`) on every side a
rounded-bordered child can reach. If not, and a child border/edge looks like it's
missing, this is very likely why.

### Known fixed instances

- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesCaseAnnotationsModal.tsx`
  (~line 267): `overflow-y-auto pr-1` → `overflow-y-auto p-1`.
- `apps/desktop/src/components/CaseManagement/CaseManagementCaseCreateTemplateFields.tsx`
  (~line 118, the "Template Fields" grid on the Create Case screen): `overflow-y-auto pr-1`
  → `overflow-y-auto p-1`.
- `apps/desktop/src/components/App/AppHomeOverview.tsx` (~line 115, the "Open Tasks" card
  on the home page Overview): `max-h-56 overflow-y-auto space-y-2` → `max-h-56 overflow-y-auto space-y-2 p-1`.
- `apps/desktop/src/components/App/AppHomeOverview.tsx` (~line 120, the "Today's Meetings"
  card, ASC-163): `max-h-56 overflow-y-auto space-y-1.5` → `max-h-56 overflow-y-auto space-y-1.5 p-1`.
  Its `MeetingBox` children have `rounded-md border`, same shape as the Open Tasks card two
  blocks below it that already had this fix — missed when the card was first added.
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesDocumentFields.tsx`
  (~line 357, the "Document Fields" grid on the case document detail panel): `overflow-y-auto pr-1`
  → `overflow-y-auto p-1`. Its `CaseManagementCaseCreateField` children have `rounded-md border`.

## Issue 2: native `<select>` corners ignore `rounded-*` (all four corners look square)

### Symptom

A `<select>` styled with `rounded-md`/`rounded-lg` etc. renders with square corners
everywhere, not just one edge — it looks like the border-radius isn't applied at all.
This is unrelated to issue 1 (no scroll container needed to reproduce it).

### Root cause

An unstyled `<select>` keeps the browser/OS's native combo-box chrome. Chromium/WebView2
draws that native widget with its own box, which ignores `border-radius` on the element.
The rest of this codebase's `<select>` elements avoid this by pairing `rounded-*` with
`appearance-none` (which strips native chrome so the CSS border fully applies) — see
`SettingAiComponents.tsx:67`, `DocsManagementTemplatesForm.tsx:255`,
`OpenCasesDocumentFields.tsx:311`, `TaskStatusSelect.tsx:37`. A `<select>` missing
`appearance-none` is the outlier, not the norm.

### Fix

Add `appearance-none` (and typically `cursor-pointer`, since removing native chrome also
removes the pointer cursor) to the `<select>`'s className. Don't blanket-apply this to
sibling `<input>` elements that happen to share the same className string — `appearance-none`
and `cursor-pointer` are wrong on a text/password input (no native corner-radius issue,
and `cursor-pointer` misrepresents it as clickable-only).

Example fix applied in
`apps/desktop/src/components/Settings/SettingVoiceEngine.tsx` (~lines 186, 201, the
Provider/Model selects):

```diff
- className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
+ className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
```

### How to spot other instances

```bash
grep -rn -A8 "<select" apps/desktop/src/components --include="*.tsx" | grep "className=" | grep "rounded-" | grep -v "appearance-none"
```

(Run from the repo root. A plain `grep -A5 "<select" | grep -B5 "rounded-"` looks
tempting but produces false positives/negatives — piping `-A`/`-B` context through a
second `grep` loses the association between the `<select>` line and its `className`
line. Filtering directly on `className=` lines from the `-A8` context is what actually
works.)

Any `<select>` with a `rounded-*` class but no `appearance-none` nearby is a candidate.

### Known unfixed instances (found via the grep above, not yet fixed)

- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesCaseAnnotationsTagsEditor.tsx:89`
  (the "type" tag's case-type `<select>`)

### Known fixed instances

- `apps/desktop/src/components/Settings/SettingVoiceEngine.tsx` (~lines 186, 201, the
  Provider/Model selects).
- `apps/desktop/src/components/Calendar/MeetingForm.tsx` (~line 158, the "Linked Case"
  select, ASC-163) — built without `appearance-none` in the first pass, caught during
  manual testing (all four corners square, not just one edge — the tell for this issue
  vs. issue 1).
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesAddDocumentTemplate.tsx`
  (~line 250, the "Select Template" select in the "Add Document to Case" modal).
- `apps/desktop/src/components/CaseManagement/CaseManagementAddOrganizationModal.tsx`
  (~line 59, the "Billing Method" select in the "Add New Organization" modal, ASC-192).
