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

**Goal**: a lawyer can register and log in from inside the desktop app (email/password or Google), and the desktop app holds a session it can present to the backend afterward. This is the PRD's #1 and #2, and the foundation everything else in Phase 1–3 sits on.

Design source: `implementation_plan.md`'s "Authentication Flow" section already worked out the hard part — Google/Facebook block OAuth inside embedded webviews, so OAuth must open the user's system browser, and the result has to come back into the Tauri app via a custom URL scheme. Reusing that design here rather than re-deriving it.

**[NEW] Tauri deep-link plugin** — not present today (`tauri-plugin-deep-link` absent from `Cargo.toml`/`package.json`, confirmed). Add it, register the `doron-desktop://` scheme in `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`.

**[NEW] `apps/desktop/src-tauri/src/auth/mod.rs`**
- `save_session(app, token, user_email, tier) -> Result<()>` — persist the session in the local SQLite `user_settings`-style table (new `auth_session` table: `token`, `email`, `tier`, `expires_at`).
- `get_session(app) -> Option<Session>`, `clear_session(app)`.
- `#[tauri::command] async fn login_with_credentials(email, password) -> Result<Session, String>` — POSTs to a new backend endpoint, stores result.
- `#[tauri::command] fn start_oauth_login(provider: "google"|"facebook")` — opens `http://<backend>/login?platform=desktop&provider=...` via `tauri_plugin_opener`.
- Deep-link event listener (registered in `lib.rs::run()`) — on `doron-desktop://auth?token=...`, calls `save_session`.

**[MODIFY] `apps/backend/app/page.tsx`** (or a new `app/login/desktop-callback/page.tsx`) — after a successful NextAuth session with `?platform=desktop` in the query string, render a page whose only job is `<a href="doron-desktop://auth?token=...">` (or auto-redirect via `window.location`), matching the design already in `implementation_plan.md`.

**[NEW] `apps/backend/app/api/auth/desktop-token/route.ts`** — issues a long-lived opaque token (or signed JWT) for the desktop client, separate from the NextAuth web session cookie, since desktop can't hold browser cookies across app restarts the same way.

**[MODIFY] Desktop Settings UI** (`apps/desktop/src/components/Settings/`) — new `SettingAccount.tsx` (or extend `SettingPreferences.tsx`, matching `implementation_plan.md`'s original placement): email/password fields, "Sign in with Google" / "Sign in with Facebook" buttons, signed-in-as indicator, sign-out.

**[NEW] Registration entry point** — either reuse the backend's existing `/api/auth/signup` route by opening it in-browser (fastest, reuses working code) or build a native desktop signup form calling it directly (`fetch` from Rust or the frontend to the backend host). Recommend the browser route for v1 to avoid duplicating validation/bcrypt logic in two places — revisit only if a fully-native flow is required later.

**Verification**
- Fresh desktop install → Settings → Sign In → complete Google OAuth in system browser → app receives deep link → session persisted → app restart still shows signed-in.
- Email/password login and signup both work end-to-end against a local backend instance.
- No case/document data leaves the machine as a side effect of adding this (privacy NFR from PRD §6) — confirm via a network trace during normal case-management use.

---

## Phase 1 — Subscription & plan selection (PRD 5.3)

**Goal**: registration captures Free/Pro choice; backend has a real source of truth for it; Free is fully functional with zero payment friction.

**[MODIFY] `apps/backend/database/schema.ts`** — add to `users`:
```ts
tier: text("tier", { enum: ["free", "pro"] }).default("free").notNull(),
```
(Using `tier` rather than `implementation_plan.md`'s proposed boolean `isPro` — a string enum matches `SubscriptionTier` in `featureGating.ts` exactly and avoids a second boolean-vs-string mapping layer later if a third tier ever appears. Small deviation from the prior draft, flagged here rather than silently changed.)

**[MODIFY] `apps/backend/app/api/auth/signup/route.ts`** — accept `tier` in the signup payload, default `"free"` if omitted.

**[NEW] Plan-selection UI** — on the backend's signup page (`apps/backend/app/`), a simple two-card Free/$0 vs Pro/$X selector before/during signup.

**[NEW] `apps/backend/app/api/webhooks/payments/route.ts`** — Stripe (or equivalent) webhook, exactly as scoped in `implementation_plan.md`: `checkout.session.completed`/`invoice.paid` → `tier = "pro"`, `customer.subscription.deleted`/`invoice.payment_failed` → `tier = "free"`.

**Open decision needed before this phase starts**: actual payment provider and Pro pricing — not decided anywhere yet (PRD §8.5). Stripe is assumed only because `implementation_plan.md` already assumed it.

**Verification**
- New signup with Free selected → `users.tier = 'free'`, no payment flow triggered.
- New signup with Pro selected → redirected to checkout → webhook flips `tier` to `'pro'` on completion.
- Downgrade path (subscription cancelled) flips back to `'free'` without deleting any user data.

---

## Phase 2 — Wire feature gating to real identity

**Goal**: replace the hardcoded `CURRENT_TIER` stub with the real session tier from Phase 0/1, and merge the gating infra into `master`.

**[MODIFY] `apps/desktop/src/lib/featureGating.ts`** (currently only on open PR #61, not in `master` — merge that first) — replace:
```ts
const CURRENT_TIER: SubscriptionTier = "pro"; // hardcoded stub
```
with a read from the Phase-0 session (`get_session` Tauri command → `tier` field), falling back to `"free"` when signed out or offline past the cache TTL decided in Phase 1.

**[MODIFY] `apps/desktop/src/store/aiStore.ts`-style store** — new `sessionAtom` (jotai, matching the existing `aiConfigAtom` pattern) populated by a `triggerSessionRefresh()` analogous to `triggerGlobalHealthCheck()`, called at app startup.

**Verification**
- Signed-in Free user: `isFeatureEnabled("voice_recording")` / `isFeatureEnabled("emails")` return `false` per current `FEATURE_GATES` (both are `pro`-only per your last edit); signed-in Pro user gets `true`.
- Signed-out / offline-past-TTL falls back to Free, never silently grants Pro.

---

## Phase 3 — AI gated to Pro (PRD 5.7)

**Goal**: every AI-backed capability actually checks the gate before running, not just the two features already named in `FEATURE_GATES`.

**[MODIFY] `apps/desktop/src-tauri/src/llm/mod.rs`** command entry points — add a tier check at the top of the Tauri commands already registered in `lib.rs` (`get_ai_settings`, `check_ai_health`, `check_local_model_status`, `install_local_model`, `transcribe_audio_local`, `transcribe_audio_cloud`, `extract_field_value`, etc.) — reject with a clear "Pro required" error for Free-tier sessions, mirroring how `voice_recording`/`emails` are already modeled as `FeatureKey`s. This likely means adding `ai_features` (or similar) as a new `FeatureKey` alongside `voice_recording`/`emails` in `featureGating.ts`, and passing the caller's tier through from the frontend on each `invoke()`.

**[MODIFY] Frontend AI entry points** (`SettingAiProvider.tsx`, `VoiceFieldFiller.tsx`, search UI reranking trigger) — disable/hide the control and show an upgrade prompt when `isFeatureEnabled("ai_features")` is `false`, rather than letting the user hit a Rust-side error.

**Decision needed**: does "AI is Pro-only" include the local on-device model, or only cloud AI? PRD says "AI is Pro-only" without distinguishing — local inference has near-zero marginal cost to you, so gating it too is a product choice, not a technical necessity. Flag for confirmation; this plan assumes **both** are gated, since the PRD text doesn't carve out an exception.

**Verification**
- Free-tier user: every AI-touching button (voice, email classification, search rerank, template field extraction) is visibly disabled with an upgrade CTA, not silently broken.
- Pro-tier user: unchanged behavior from today.

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
