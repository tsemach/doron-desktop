# Backend marketing pages — visual redesign plan

## Context

`apps/backend` is Ascurix's marketing/auth web portal (see root `CLAUDE.md`). Its
look and feel is currently inconsistent (home and pricing are forced dark via a
`dark` class + `bg-slate-950`, while `resources/key-features` is light) and uses
an ad-hoc 6-color accent palette per feature card. This plan restructures the
marketing surface (`/`, `/pricing`, `/resources/key-features`) to borrow the
*structural* patterns from kadin.co.il (features/solutions pages) — hero
atmosphere, pill-tab section nav, alternating feature blocks, hairline
secondary-feature rows, a CTA banner, a footer — without cloning their brand.
Ascurix keeps its own identity: the Fraunces display serif, the `§` watermark,
and its own copy.

Reference screenshots analyzed (not copied): kadin.co.il `/features`,
`/solutions`, `/solutions/law-firm-crm`.

Decisions locked in:
1. **Light theme is the marketing baseline.** Drop the forced-dark treatment
   on `/` and `/pricing`; they adopt the same light theme `resources/key-features`
   already uses.
2. **Single accent color**, replacing the 6-color `ACCENT` rainbow
   (`blue/indigo/teal/amber/rose/sky`) currently in `app/page.tsx`. Recommend
   `teal` (already in the palette, closest to kadin's mint/teal without
   copying their exact hue) — final hex/oklch to be confirmed against
   `apps/backend/app/globals.css` tokens during implementation.

Out of scope for this plan: `apps/office`, `apps/desktop`, auth pages
(`login`, `register`, `checkout`) — their forms already share the shadcn
theme via `globals.css` and aren't part of the kadin-style content pages.

## New shared components

All new, reusable across `/`, `/pricing`, `/resources/key-features`. Proposed
location: `apps/backend/components/marketing/`.

1. **`HeroSection.tsx`**
   Centered hero shell: optional kicker label, headline (`font-display`),
   subhead, dot-grid background texture + soft accent-color gradient blob
   (replaces/extends the current bare `§` watermark treatment in
   `app/page.tsx:108-152`). Keeps the watermark as an Ascurix-specific extra
   layered on top, not a replacement for it.

2. **`PillTabs.tsx`**
   Horizontal rounded-pill nav for jumping between page sections (kadin's
   category tabs). Controlled component: `{ id, label }[]`, `activeId`,
   `onSelect`. Used to replace the vertical sidebar in
   `KeyFeatureFeaturesList.tsx`.

3. **`FeatureBlock.tsx`**
   Alternating two-column section: icon badge + title + paragraph + checklist
   bullets on one side, a device-frame mockup slot (screenshot or illustration)
   on the other. `side: "left" | "right"` prop drives alternation. Replaces the
   ad-hoc markup duplicated across `KeyFeature*.tsx` files.

4. **`FeatureRow.tsx`** + **`FeatureRowList.tsx`**
   Hairline-divided icon+title+one-line-description rows (kadin's secondary
   feature lists) for lower-priority features that don't need a full
   `FeatureBlock`.

5. **`CtaBanner.tsx`**
   Rounded-2xl dark gradient (accent-tinted navy) banner with headline + one
   primary pill CTA + one secondary outline CTA. Used near the bottom of
   `/`, `/pricing`, and `/resources/key-features`.

6. **`Footer.tsx`**
   New — none exists today (`grep -ri footer apps/backend` returns nothing
   but an unrelated `ConfirmDialog.tsx` match). Dark navy, 4-column: logo +
   one-line blurb, page nav, resources links, contact/social. Mounted once in
   `app/layout.tsx` so every route gets it, rather than per-page.

## Design tokens

`apps/backend/app/globals.css`:
- No new CSS variables strictly required — `--primary`/`--accent` already
  exist via the shared shadcn tokens. Introduce a single
  `--color-brand-accent` (teal-family oklch) if the marketing pages need a
  hue distinct from the shadcn `--primary` (which is grayscale by default,
  see `:root` block). Confirm during implementation whether reusing
  `--primary` is enough or a dedicated brand token is cleaner — avoid adding
  tokens that duplicate existing ones.
- Dot-grid texture: CSS `background-image` radial-gradient pattern utility,
  no new dependency needed.

`apps/backend/app/page.tsx`:
- Delete the `ACCENT` map (`page.tsx:28-35`) and the per-card `accent` field
  on `features` (`page.tsx:63-100`) — every icon badge uses the single brand
  accent instead.

## Page-by-page changes

### `app/page.tsx` (home)
- Drop `dark` class + `bg-slate-950 text-slate-50` (`page.tsx:103`) → light
  background matching `resources/key-features`.
- Replace the bespoke hero markup (`page.tsx:108-152`) with `<HeroSection>`.
- "Why Ascurix" 3-card grid (`page.tsx:154-190`) stays structurally — already
  close to kadin's solutions-grid pattern — just re-themed to light + single
  accent.
- "Key Features" preview grid (`page.tsx:192-230`) re-themed the same way;
  icon badges drop the `ACCENT` lookup.
- Add `<CtaBanner>` before the page ends.

### `app/pricing/page.tsx`
- Drop `dark` class + `bg-slate-950` (`pricing/page.tsx:105`) → light theme.
- Plan cards (`pricing/page.tsx:118-163`): re-theme borders/backgrounds for
  light mode; the "highlighted" plan keeps a single accent ring instead of
  blue-specific classes (`border-blue-500/50`, `shadow-blue-500/10`, etc. at
  `pricing/page.tsx:122-129`).
- Add `<CtaBanner>` above the footer for plan questions / contact sales.

### `app/resources/key-features/page.tsx` + `components/resources/key-features/*`
- Replace the vertical sidebar (`KeyFeatureFeaturesList.tsx`) usage with
  `<PillTabs>` under a new `<HeroSection>` for this page (kicker "Features",
  headline, subhead) — mirrors kadin's `/features` structure most directly.
- Each `KeyFeature*.tsx` panel (`KeyFeatureCentralWorkingSpace.tsx` and five
  siblings) gets rebuilt on `<FeatureBlock>` instead of its own bespoke
  grid+carousel markup. The existing screenshot carousel content
  (`KeyFeatureCentralWorkingSpace.tsx:112-164`) becomes the mockup slot content
  for that block — kept as real screenshots (not illustrations), just
  reframed consistently via the shared component instead of one-off markup
  per file.
- Any secondary/minor bullet points inside each panel move to
  `<FeatureRowList>` instead of being folded into the same 2-column card grid
  as primary features.

### `app/layout.tsx`
- Mount `<Footer>` once, after `{children}`, so it's global without every
  page needing to import it.

## Rollout order

1. Land the shared components (`marketing/*`) + token change, unused until
   wired in — no visible change yet, easy to review in isolation.
2. Re-theme `resources/key-features` first (already light, smallest visual
   delta, validates the new components against six real feature panels).
3. Re-theme `app/page.tsx` (home) — highest-traffic page, do after the
   components are proven.
4. Re-theme `app/pricing/page.tsx`.
5. Add `Footer` globally last, once nav links across all pages are finalized.

## Resolved decisions (previously open questions)

- **Accent token**: dedicated `--brand-accent` (teal-family oklch), not a
  reuse of `--chart-2`. Keeps the marketing brand color decoupled from the
  `--chart-1..5` palette reserved for data visualizations, so retuning one
  never shifts the other.
- **Mockup content**: `FeatureBlock` slots without a clean existing product
  screenshot get an **illustrated fallback frame** (simplified stylized
  device frame, kadin-style) instead of being skipped — every feature block
  ships looking finished even before a real screenshot exists.
- **Footer content**: shipped with **obviously-fake placeholder content**
  (e.g. `support@ascurix.com`, TODO-marked social links) since no contact
  email or social links exist anywhere in the codebase today. Real copy
  swaps in later.
