# Amicus — Implementation Plan

Status: Draft v1 — 2026-07-20
Companion to `PRD.md` (read that first — this plan implements its §5 feature list, in the order justified below).

Naming note: the product is **Amicus** — "Doron Desktop" now only names the repo, local directory, app identifier (`com.tsemach.doron-desktop`), and the `doron-desktop://` deep-link scheme used in Phase 0, all of which stay unchanged until manually migrated.

This replaces the previous contents of this file (a completed, historical plan for porting `index_documents.py` to Rust — that work is done and shipped). `implementation_plan.md` at the repo root is prior art for Phase 0/1 below and is absorbed into this plan rather than duplicated in full.

## Assumptions carried forward from PRD §8

Stated explicitly so they're easy to challenge; each maps to an open question in `PRD.md`:

- "Username" login = email address (no separate username field planned).
- Case-template placeholder propagation stays creation-time-only for this plan (Phase 4 below is written as an *optional* add-on, not baseline, until confirmed).
- Solo-practitioner only — no multi-user/firm accounts in this plan.
- Only AI (5.7) is Pro-gated for v1; case management, document search, versioning, email, and (once built) Mishpat Net stay free. `FEATURE_GATES` in `featureGating.ts` is written per-feature already, so loosening this later is a config change, not a rearchitecture.
- Login is required once, online; the app then works offline until the cached session/entitlement expires (a specific TTL needs a decision in Phase 1, not deferred indefinitely).

## Why this order

Five of eleven PRD features (case management, document search, versioning, email, templates-at-creation) are already implemented and need refinement, not new architecture — they're sequenced last, as backlog. Four features (registration, login, plan selection, AI gating) all depend on one missing piece: **the desktop app has no identity at all**. Building that bridge once, correctly, unblocks all four at once instead of bolting ad hoc auth onto each. Mishpat Net and case simulation are independent of the auth bridge but have their own blockers (legal review; explicit future-scope), so they're sequenced by readiness, not dependency.

```
Phase 0: Desktop ↔ Backend identity bridge     ─┐
Phase 1: Subscription & plan selection          ├─ unblocks 5.1, 5.2, 5.3
Phase 2: Wire feature gating to real identity    │
Phase 3: AI gated to Pro                        ─┘
Phase 4: Template live-sync (optional — confirm need first)
Phase 5: Mishpat Net (research spike, then build)
Phase 6: Refinement backlog (already-working features)
Deferred: Case simulation (5.11), multi-user/firm accounts
```

---

## Phase 0 — Desktop ↔ Backend identity bridge

**Goal**: PRD #1/#2/#3 exactly as specified — desktop opens on a Register/Login screen; Register hands off to the backend for account creation (password or Google/Facebook) and plan selection, then tells the user to return to the desktop; Login is a separate, explicit step back in the desktop app. This is the foundation everything in Phase 1–3 sits on.

**Design note (deviates from `implementation_plan.md`'s original sketch)**: because registration ends with the user manually returning to the app rather than an automatic hand-off, the *registration* half needs no token transfer at all — it's plain browser pages. The hard problem (OAuth blocked inside embedded webviews) only resurfaces for the **Google/Facebook branch of Login**, which still has to leave the app. Password login stays a direct API call, no browser needed. This narrows the deep-link/hand-off machinery to one sub-flow instead of the whole feature.

**Open call for 0.9 below**: deep-link (`doron-desktop://`, OS registers the app as a URL handler, auto-focuses the app when OAuth completes) vs. a pairing-code the desktop polls for (backend shows a short code, desktop asks "has this code been claimed?" every few seconds — no OS scheme registration, no per-platform quirks, but a slightly slower UX). Tasks below assume deep-link, matching the prior draft and the pattern most desktop apps (Slack, GitHub Desktop, Discord) use for this exact problem — flag if you'd rather do pairing-codes instead, it swaps out cleanly at 0.9 only.

**Cross-cutting requirement — visual design**: every new backend page in this phase (0.3, 0.4, 0.5, 0.9) must use the desktop app's actual design system, not the backend's current look. Checked directly: `apps/backend/app/globals.css` is a bare `@import "tailwindcss";` with none of the desktop's shadcn/ui theme tokens, and the one existing auth page (`apps/backend/app/login/page.tsx`) is a hand-rolled glassmorphic gradient design branded "Doron Client Portal" — visually unrelated to the desktop app's actual shadcn/ui "radix-nova" style (`apps/desktop/src/styles/globals.css`, `apps/desktop/components.json`). Concretely: pull the same `@theme inline` CSS-variable block + `shadcn/tailwind.css` import into `apps/backend/app/globals.css`, and grow `packages/ui/src/components/` (currently just `button.tsx`) with the shared primitives these pages need (input, card, tabs) instead of each app hand-rolling its own. **This requirement must be stated explicitly in the PR description** for whichever of 0.3/0.4/0.5/0.9 lands first, so it isn't reviewed as if it were a from-scratch design.

**Cross-cutting requirement — API path convention**: every backend JSON API route this plan touches or adds lives under `/api/v1/` — established here as the convention for all of `apps/backend`'s hand-written API routes going forward (NextAuth's own framework-owned routes, `/api/auth/[...nextauth]`, are exempt — they're not ours to version). Concretely for this phase: the existing `apps/backend/app/api/auth/signup/route.ts` moves to `apps/backend/app/api/v1/auth/signup/route.ts`, and every new route below (0.7, 0.9, Phase 1's webhook) is created under `/api/v1/` from the start. Note this only affects JSON API routes, not page routes — `/register`, `/register/plan`, `/register/complete`, `/login` stay as plain pages, they just call `/api/v1/...` endpoints. Pre-existing unversioned routes outside this phase's scope (`/api/templates`, `/api/download`) are left alone for now — flagging as a follow-up cleanup rather than pulling them into Phase 0.

### Registration sub-flow (browser-only, no session created)

**0.1 — [NEW] Desktop auth landing screen** — `apps/desktop/src/components/Auth/AuthLanding.tsx`: the component only, two buttons ("Register" → 0.2, "Login" → 0.6). Not wired into the app's default routing here — that cutover belongs solely to 0.10, so this component can merge standalone with zero effect on current users.

**0.2 — [NEW] Desktop "Register" action** — opens `http://<backend>/register?platform=desktop` via `tauri_plugin_opener` (already a dependency, no new plugin needed for this half). This is a page route, not an API call — the page itself calls `/api/v1/auth/signup` (see below). No token/code generated here — registration doesn't report back to the app at all.

**0.3 — [NEW/restructure] Backend registration page** — `apps/backend/app/register/page.tsx`. Don't build from scratch: `apps/backend/app/login/page.tsx` already has a working signup tab (full name/email/password/confirm fields, `signIn("credentials")` after signup, Google/Facebook social buttons) — split that logic out into its own route and restyle it per the design requirement above. Calls `POST /api/v1/auth/signup` (moved per the path convention above), plus "Continue with Google" / "Continue with Facebook" via `next-auth`'s `signIn()`, reusing the providers already configured in `auth.config.ts`. Reuse the existing validation/bcrypt logic — don't duplicate it.

**0.4 — [NEW] Backend plan-selection page** — `apps/backend/app/register/plan/page.tsx`: Free ($0) / Pro (paid) cards, styled per the design requirement above. Free writes `users.tier = 'free'` immediately and continues; Pro starts a checkout session through Phase 1's `PaymentProvider` abstraction (Paddle is the lead candidate, not final — see Phase 1) and shows "activating" until the webhook confirms. **Depends on Phase 1's `users.tier` column existing** — Phase 0 and Phase 1 are now interleaved for this page specifically, not strictly sequential.

**0.5 — [NEW] Backend "return to desktop" page** — `apps/backend/app/register/complete/page.tsx`: confirmation, styled per the design requirement above — "You're all set — return to the Amicus desktop app and log in." No token issued, no deep link fired as part of the required flow. See 0.5a for an optional convenience addition.

**0.5a — [NEW, low priority/optional] "Open Amicus" button on the complete page** — a button that, if clicked, brings the desktop app to focus if it's already running, or launches it if not. Cheap to add *because* 0.9 already brings in `tauri-plugin-deep-link` for OAuth login — this is one more link (`<a href="doron-desktop://">`, no token/params needed, just a ping) rather than new infrastructure. The one addition it does need on top of 0.9: `tauri-plugin-single-instance`, paired with deep-link so a second launch focuses the existing window instead of spawning a duplicate process (the standard Tauri pattern for this). If that pairing turns out fiddly in practice, drop this task — it's explicitly a nice-to-have, not required for the flow to work (the user can already just alt-tab back).

**0.12 — [FOUND GAP] Email verification** — not in the original 12 tasks; found via manual testing that `signup/route.ts` never confirmed the registrant controls the email they typed (and separately, that `middleware.ts` made `/register` itself unreachable — fixed alongside this). Reuses `verificationTokens` (already in `schema.ts`, unused until now). `lib/email/types.ts`+`mock-provider.ts` (swappable `EmailProvider`, same pattern as `lib/payments/` — no real provider set up yet). `lib/emailVerification.ts` (create/consume, single-use, 24h TTL). `lib/verifyCredentials.ts` — new shared helper (was duplicated bcrypt logic between `auth.ts` and `desktop-login/route.ts`) that also enforces **login blocked until verified**, with one deliberately generic error message for both wrong-password and unverified-email (avoids enumerating registered-but-unverified accounts). OAuth sign-ins skip verification (already provider-proven), auto-stamped via `events.signIn`. New pages `/register/check-email` and `/verify-email`; the latter sends the user to `/login?justVerified=1` so the register → plan continuity survives the detour through email. No "resend verification" flow yet — a lost/expired link currently has no recovery path but manual DB cleanup.

### Login sub-flow (desktop-side, separate explicit action)

**0.6 — [NEW] Desktop login screen** — `apps/desktop/src/components/Auth/Login.tsx`: email + password fields, plus "Login with Google" / "Login with Facebook" buttons. Reached from 0.1's "Login" button.

**0.7 — [NEW] Password login (no browser)** — `apps/backend/app/api/v1/auth/desktop-login/route.ts`: accepts `{email, password}`, validates via the same bcrypt-compare logic the NextAuth Credentials provider already uses (`auth.ts`), returns a desktop-specific token (opaque or signed JWT — distinct from the NextAuth web session cookie, since the desktop app can't hold browser cookies across restarts). Desktop frontend calls this directly (`fetch`/`invoke` → Rust `reqwest`), no browser popout.

**0.8 — [NEW] `apps/desktop/src-tauri/src/auth/mod.rs`** — local session persistence: new `auth_session` SQLite table (`token`, `email`, `tier`, `expires_at`). Commands: `save_session`, `get_session`, `clear_session`, registered in `lib.rs`'s `generate_handler!`. Called after both 0.7 (password) and 0.9 (OAuth) succeed.

**0.9 — [NEW/restructure] OAuth login hand-off** — the one genuinely hard piece, per the open call above:
- Add `tauri-plugin-deep-link` (absent from `Cargo.toml`/`package.json` today, confirmed) — register `doron-desktop://` in `tauri.conf.json` + `capabilities/default.json`.
- Desktop "Login with Google/Facebook" opens `http://<backend>/login?platform=desktop&provider=google` via `tauri_plugin_opener`.
- Restyle/restructure the existing `apps/backend/app/login/page.tsx` (see design requirement above — its social-login handlers already exist and work, they just need the `platform=desktop` branch and new styling) so that on success it redirects to a page whose only job is `<a href="doron-desktop://auth?token=...">` (auto-clicked via `window.location`), where the token comes from a new `apps/backend/app/api/v1/auth/desktop-token/route.ts` (same token shape as 0.7's).
- Deep-link event listener in `lib.rs::run()` receives `doron-desktop://auth?token=...`, calls `save_session` (0.8).

**0.10 — [MODIFY] App shell gating** — `App.tsx`: the sole owner of the actual cutover (0.1 only builds the component, unwired). Route to 0.1 when `get_session()` returns none/expired; route to the existing main UI once a session exists — gated behind an `AUTH_REQUIRED` constant, **defaulted to `false`**, so this can ship in the same PR as 0.1–0.9 without locking out any existing user the moment it merges. Flipping it to `true` is a deliberate, separate, one-line follow-up once 0.1–0.9 are verified working end to end. Confirms the "opening screen" framing — flagged above as worth confirming against the offline-first NFR before building.

**0.11 — Error/edge states** — backend registration page reachable without `platform=desktop` (e.g. a lawyer just visits the marketing site) should still work as plain web signup, not assume desktop context. OAuth login timeout/cancel in the system browser should leave the desktop login screen in a clear "waiting… / try again" state rather than hanging silently.

**Verification**
- Fresh desktop install → Register → complete signup + Free plan selection in browser → confirmation page → return to desktop → Login with the same email/password → session persisted, app restart still shows signed-in.
- Same flow with Google instead of password at registration, then "Login with Google" at the desktop login screen → deep link fires → session persisted.
- Registering via the plain web portal (no `platform=desktop`) still works unmodified.
- Every new/restyled backend page visually matches the desktop app's shadcn/ui theme (shared CSS variables, not a distinct look) — spot-check side by side, not just "it renders."
- All new/moved API calls hit `/api/v1/...` paths; no new route created outside that prefix.
- No case/document data leaves the machine as a side effect of adding this (privacy NFR from PRD §6) — confirm via a network trace during normal case-management use.

---

## Phase 1 — Subscription & plan selection (PRD 5.3)

**Goal**: registration captures Free/Pro choice; backend has a real source of truth for it; Free is fully functional with zero payment friction.

**Already shipped in Phase 0** (pulled forward since 0.4 genuinely needed them): `users.tier` column (`apps/backend/database/schema.ts`) and the plan-selection UI (`apps/backend/app/register/plan/page.tsx`) both already exist. What's actually left below is the payment plumbing behind the (currently disabled, "Coming soon") Pro option on that page.

**Decisions made**: Pro is **$49/month**. Payment provider work starts against a **mock `PaymentProvider`**, not real Paddle — no Paddle vendor/API credentials exist yet. The interface is designed so swapping the mock for a real `paddle-provider.ts` later touches only one new file, not the plan page or webhook route.

**[NEW] `apps/backend/lib/payments/types.ts`** — the swappable interface, mirroring the pattern already used twice in this codebase (`llm/llm_provider.rs`'s trait, `featureGating.ts`'s `FeatureGateProvider`):
```ts
interface PaymentProvider {
  createCheckoutSession(userId: string, email: string): Promise<{ checkoutUrl: string }>;
  verifyAndParseWebhook(req: Request): Promise<{ userId: string; tier: "free" | "pro" } | null>;
}
```

**[NEW] `apps/backend/lib/payments/mock-provider.ts`** — `createCheckoutSession` returns a link to a local mock checkout page (not a real payment page) that immediately "succeeds" and fires the webhook itself; `verifyAndParseWebhook` trusts the payload with no signature check (a real provider's implementation must verify a signature — noted so this isn't mistaken for how the real one should work).

**[NEW] `apps/backend/app/api/v1/payments/checkout/route.ts`** — authenticated (`auth()`), calls `PaymentProvider.createCheckoutSession`, returns `{checkoutUrl}`. Called when the plan page's Pro button is clicked.

**[NEW] `apps/backend/app/api/v1/webhooks/payments/route.ts`** — provider-agnostic route name (not `/webhooks/paddle`, for the same swappability reason): calls `PaymentProvider.verifyAndParseWebhook`, then on a resolved `{userId, tier}` writes `users.tier` accordingly.

**[MODIFY] `apps/backend/app/register/plan/page.tsx`** — Pro card becomes clickable: calls the checkout route, redirects to `checkoutUrl`. Free path (`select-plan`) is unchanged — it stays a separate, synchronous, immediate path, since Free never needs a checkout round-trip.

**Deferred to when real Paddle credentials exist**: `apps/backend/lib/payments/paddle-provider.ts` (the real implementation), webhook signature verification, and Paddle's actual event-name mapping (`subscription.activated`/`.canceled` etc. — confirm exact names against Paddle's docs when building this, their taxonomy differs from Stripe's `checkout.session.completed` style `implementation_plan.md` originally assumed).

**Verification**
- New signup with Free selected → `users.tier = 'free'`, no checkout triggered (unchanged from Phase 0).
- New signup with Pro selected → mock checkout → webhook flips `tier` to `'pro'`.
- Swapping `mock-provider.ts` for a different implementation in a test doesn't require touching the plan-selection page or webhook route — confirms the abstraction actually isolates provider-specific code.

---

## Phase 2 — Wire feature gating to real identity

**Goal**: replace the hardcoded `CURRENT_TIER` stub with the real session tier from Phase 0/1, and merge the gating infra into the stack.

**Already shipped in Phase 0**: `sessionAtom`/`sessionStatusAtom`/`refreshSession()` (`apps/desktop/src/store/authStore.ts`) — this phase originally called for building that; it existed already by the time this phase started.

**[DONE] Merged AMI-36's branch** (`featureGating.ts`, previously independent of the auth work) into this stack.

**[MODIFY] `apps/desktop/src/lib/featureGating.ts`** — `getCurrentSubscriptionTier()` now reads `getDefaultStore().get(sessionAtom)` instead of the hardcoded `CURRENT_TIER` constant, falling back to `"free"` when there's no session. No separate TTL check needed here — `sessionAtom` already holds `null` past `expires_at` (see `refreshSession()`).

**[FIX] `apps/desktop/src/App.tsx`** — `refreshSession()` was only called when `AUTH_REQUIRED` was `true`; changed to always run on startup, since feature gating needs the real tier regardless of whether the login wall is enforced.

**Verification**
- Signed-in Free user: `isFeatureEnabled("voice_recording")` / `isFeatureEnabled("emails")` return `false` per current `FEATURE_GATES` (both are `pro`-only); signed-in Pro user gets `true`.
- Signed-out / offline-past-TTL falls back to Free, never silently grants Pro.

---

## Phase 3 — AI gated to Pro (PRD 5.7)

**Goal**: every AI-backed capability actually checks the gate before running, not just the two features already named in `FEATURE_GATES`.

**Decisions made**:
- **Local AI stays completely ungated** — it's deprecated and will be removed later; not worth gating now. None of the tasks below touch local-mode behavior.
- Three AI-touching surfaces already have a **working non-LLM fallback today**, discovered by reading the actual code rather than assumed — these just need a tier check ANDed into their *existing* local/cloud condition, no new fallback logic:
  - **Indexing metadata extraction** (`indexer/mod.rs`, both `index_file` and `index_folder`): `run_llm_metadata: !is_local` → `!is_local && is_pro_tier(&app)`. Falls back to the already-existing `extract_heuristic_metadata` (the same function local mode already uses).
  - **Search reranking** (`query/mod.rs`): `use_llm_rerank: !is_local` → `!is_local && is_pro_tier(&app)`. Falls back to the already-existing raw hybrid FTS+vector results (reranking was already a pure optional enhancement).
- **Email is a full block, not a degraded fallback** — different treatment from the two above. `emails_ai.rs::run_cascade_classification` already has a working embeddings-only fallback when no LLM is configured, but the decision here is that Free tier shouldn't get *any* email pulling at all, not even that degraded classification. This completes wiring the `emails` `FeatureKey`, which has existed in `FEATURE_GATES` since Phase 0/AMI-36 but was never connected to actual functionality.
- **Everything else is a hard block**: voice transcription, direct field extraction, cloud AI provider settings/health check, cloud model install — no non-AI equivalent, reject + disable in UI.

**Real bug found while scoping this**: `auth::get_session` (Rust) never checks `expires_at` against now — only the TS side (`authStore.ts::refreshSession`) does. Since this phase adds the first Rust-side consumer of tier info, fixing this at the source rather than propagating the gap into a second, inconsistent expiry check.

**[NEW] `apps/desktop/src-tauri/src/auth/mod.rs`** — fix `get_session`'s missing expiry check; add `is_pro_tier(app: &AppHandle) -> bool`.

**[MODIFY] `apps/desktop/src/lib/featureGating.ts`** — add `"ai_features"` to `FeatureKey`/`FEATURE_GATES` (pro-only, matching `voice_recording`/`emails`).

**[MODIFY] `apps/desktop/src-tauri/src/indexer/mod.rs`** — gate `run_llm_metadata` per above.

**[MODIFY] `apps/desktop/src-tauri/src/query/mod.rs`** — gate `use_llm_rerank` per above.

**[MODIFY] `apps/desktop/src-tauri/src/email/emails_ops.rs`** — `trigger_email_ingestion` returns a clear "Email is a Pro feature" error immediately for Free tier, before touching `get_email_settings_internal`/IMAP at all; `poll_emails_background` skips the tick entirely for Free tier (no IMAP connection attempt at all) rather than erroring, since it runs unattended every 5 minutes.

**[MODIFY] `apps/desktop/src-tauri/src/llm/mod.rs`** command entry points — reject with a clear "Pro required" error for Free-tier sessions on commands with no non-AI equivalent: voice transcription (`transcribe_audio_local`/`transcribe_audio_cloud`), `extract_field_value`, cloud AI provider settings/health check (`check_ai_health`), cloud model install. Local model management itself stays ungated per the decision above.

**[MODIFY] Frontend AI entry points** (`SettingAiProvider.tsx`, `VoiceFieldFiller.tsx`, search UI reranking trigger) — disable/hide the control and show an upgrade prompt when `isFeatureEnabled("ai_features")` is `false`, rather than letting the user hit a Rust-side error.

**Verification**
- Free-tier user: every hard-blocked AI-touching button (voice, template field extraction) is visibly disabled with an upgrade CTA, not silently broken.
- Free-tier user: indexing and search still work, using heuristic metadata / non-reranked results respectively.
- Free-tier user: email ingestion never runs — no IMAP connection attempted, manual trigger shows a clear upgrade message.
- Pro-tier user: unchanged behavior from today across all of the above.
- Local AI mode: unchanged behavior for both tiers.

---

## Phase 4 — Template live-sync (optional — confirm PRD §8.2 first)

Only build this if the answer to PRD open question #2 is "yes, live sync is required." If confirmed:

**[MODIFY] `apps/desktop/src-tauri/src/case/mod.rs::save_case_fields`** — after writing `case_fields`, also re-invoke `doc_template::replace_docx_placeholders` across every document tracked in `case_template_docs` for that case's template, same call already used in `add_case`.

**Risk**: this rewrites already-user-edited `.docx` files on every field save — if a lawyer has hand-edited generated text in Word after creation, a live re-sync would silently overwrite that. Needs a decision: re-sync unconditionally, only for untouched documents (checked via the existing `document_versions` MD5 hash), or prompt before overwriting. Not resolved in this plan — flagging as a design decision, not a coding task, same treatment as Mishpat Net's legal question.

If the answer is "creation-time-only is fine," this phase is dropped entirely and 5.6 is considered done.

---

## Phase 5 — Mishpat Net access (PRD 5.10)

**Step 1 (blocking, non-engineering)**: legal/ToS review of automated access to נט המשפט — specifically whether this operates under the lawyer's own authenticated bar credentials (personal-use automation) or attempts broader access. No code should be written before this is answered, per PRD §5.10.

**Step 2 (once cleared)**: scope as a new `apps/desktop/src-tauri/src/mishpat_net/` module, following the existing provider-abstraction pattern already used for LLM providers (`llm/llm_provider.rs` trait + per-backend implementations) so the integration is swappable if the access method changes. Exact commands depend entirely on Step 1's answer — not designed further here.

---

## Phase 6 — Refinement backlog (already-implemented features)

Lower priority than Phases 0–3; no PRD feature is blocked on these, they improve what already works:

- **Hebrew FTS quality** (PRD 5.5 open risk) — run the existing `eval` CLI (`.agents/skills/eval/SKILL.md`) against a Hebrew-heavy corpus to quantify whether the `unicode61` tokenizer + vector-search fallback is actually good enough in practice, before spending effort on a custom tokenizer or stemming layer.
- **AMI-31** (deterministic template language detection) and **AMI-32** (voice input eval harness) — already tracked in Linear under the voice-input epic, unaffected by this plan.
- **Email classification accuracy** — no specific gap identified in the code audit, but worth a periodic eval pass using the same `eval`-style methodology once enough real usage data exists.

---

## Explicitly deferred (not in this plan)

- **Case simulation** (PRD 5.11) — vision-stage only, per the user's own prioritization. No design work until Phases 0–3 ship.
- **Multi-user/firm accounts** — would touch nearly every table in `store/mod.rs` (none have an owner column today) and the entire auth bridge in Phase 0; deliberately out of scope unless PRD §8.3 comes back "yes."
- **Statsig migration** — `featureGating.ts`'s `FeatureGateProvider` interface exists specifically so this is a later, isolated swap, not part of this plan.

## Suggested sequencing for execution

Phase 0 is a hard prerequisite for 1–3 and should be one focused effort (likely several Linear issues under one epic, mirroring how the voice-input feature was broken down into AMI-26…AMI-35). Phases 4–6 can run in parallel with 0–3 since they don't share files. I haven't created Linear issues for this yet — say the word and I'll break Phase 0 down into tracked issues the same way, once you've confirmed the open decisions flagged above (payment provider, local-AI-gating scope, template live-sync requirement, Mishpat Net legal answer).
