# Implementation Plan: Backend-Proxied Online AI (Streaming)

## Context

Today, when the desktop app's AI mode is `"online"`, Rust (`apps/desktop/src-tauri`)
calls Anthropic/Gemini/OpenAI directly using either a bundled key or the
user's own key. This is moving behind the backend: all `"online"` mode
requests will be proxied through `apps/backend` via Vercel AI SDK + AI
Gateway, streaming back to the desktop over a custom NDJSON envelope, so
Amicus holds the only provider credentials and can enforce per-customer cost
controls. `byom` and `local` modes are explicitly untouched.

The full architecture, protocol, and design rationale were worked out over
an extended design discussion and are recorded in
`docs/ai-online-proxy/ai_online_proxy_architecture.md` — that document is
the settled source of truth for *why*; this plan is the *how*, refined
against this specific codebase's actual conventions (verified via direct
exploration, not assumed).

**Verified against the real code, not just the design doc:** three research
passes plus direct spot-checks surfaced gaps the original design doc missed
— no `Authorization: Bearer` convention exists anywhere (token goes in the
JSON body, matching `desktop-session`/`desktop-token` routes); no
`bytes_stream()` precedent exists (use `.chunk()`, already proven, no new
Cargo feature); `load_active_provider` is called from 5 places that only
have `AppHandle`, not a `backend_url`; two more call sites
(`check_ai_health`, `emails_orchestrate::llm_provider_from_app`) bypass
`load_active_provider` entirely and need the same branch; `cloud_transcribe.rs`
has an exhaustive (non-wildcard) match on `LlmProvider` that won't compile
once a new variant is added; and `users.id` is `text`, not `uuid`, so new
tables' foreign keys must match. All of these are folded into the plan below.

## Sequencing

```
Backend:  Phase 1 (schema) → Phase 2 (pricing/usage) → Phase 3 (deps) → Phase 4 (route)
Rust:     Phase 5 (auth/backend_url) → Phase 7 (provider) → Phase 8 (wiring) → Phase 10 (metadata flag)
          Phase 6 (NDJSON parser) — independent, can happen anytime before Phase 7
Frontend: Phase 9 — depends on Phase 8's error-string convention
```

Backend (1→4) and the Rust parser (6) have no dependency on each other and
can be built in either order. Phase 7 (the Rust HTTP client) hard-depends on
Phase 5 (needs a `backend_url` + token to call) and Phase 6 (needs the
parser). Phase 8 is the integration point — verified end-to-end against
Phase 4's route. Phase 10 touches the same file as Phase 8 (`indexer/mod.rs`)
but is an unrelated change, discovered during plan review rather than part
of the original design doc scope — can be done alongside Phase 8 or
separately.

## Branching & PR Strategy

Tracked in Linear as **AMI-67** (parent issue — holds this plan's full
content), with one sub-issue per phase (1–10) nested under it.

Git branches form a **strictly linear stack** — a deliberate simplification
for review/merge flow, not a reflection of the technical dependency graph
above (which has independent tracks: e.g. Phase 4's backend route has no
real dependency on the Phase 5–8 Rust work, and Phase 6 is independent of
Phase 5). Each phase branches off the next-lower phase; **PR0** branches off
`master` and is what ultimately merges to `master`:

```
master
 ← PR0
   ← phase-1
     ← phase-2
       ← phase-3
         ← phase-4
           ← phase-5
             ← phase-6
               ← phase-7
                 ← phase-8
                   ← phase-9
                     ← phase-10   (top of the stack)
```

**Merge order** (top of the stack down to `master`, one merge at a time —
each phase branch merges into the branch directly below it, not directly
into `PR0` or `master`):

```
phase-10 → phase-9 → phase-8 → phase-7 → phase-6 → phase-5
  → phase-4 → phase-3 → phase-2 → phase-1 → PR0 → master
```

---

## Phase 1 — Backend: schema, migration, seed

**Edit `apps/backend/database/schema.ts`** — add three tables, following the
`document_templates` convention (`uuid("id").primaryKey().defaultRandom()`,
snake_case DB columns, `timestamp(..., {mode:"date"}).defaultNow()`) but with
`text("user_id")` referencing `users.id` — **`users.id` is `text`, not
`uuid`** (confirmed: `id: text("id").primaryKey().$defaultFn(() =>
crypto.randomUUID())`), so a `uuid` FK column would be a type mismatch.

- **`plans`** — `id` (uuid pk), `tier` (`text` enum `["free","pro"]`,
  unique), `monthlyBudgetCents` (integer), `gatewayRateLimitTier` (text,
  nullable), `createdAt`.
- **`aiUsagePeriods`** — `id`, `userId` (text, FK → `users.id`,
  `onDelete:"cascade"`), `billingPeriod` (text, `"YYYY-MM"` UTC calendar
  month — there's no real subscription-anniversary billing engine yet, so
  anchor to calendar month as a deliberate simplification), `costCents`
  (integer, default 0), `createdAt`, `updatedAt`. Add a **unique index on
  `(userId, billingPeriod)`** — the usage service needs `ON CONFLICT` upsert
  semantics on this pair.
- **`aiRequests`** — `id`, `userId` (text, FK, cascade), `conversationId`
  (uuid, nullable — no FK target exists yet, just a grouping key for a
  future multi-turn surface), `purpose` (text enum: `"chat"` /
  `"email_classification"` / `"field_extraction"` / `"doc_indexing"` /
  `"query_analysis"`), `model`, `prompt` (text, nullable), `response` (text,
  nullable), `inputTokens`, `outputTokens`, `costCents`, `finishReason`,
  `errorCode` (text enum: `"rate_limited"`/`"quota_exceeded"`/`"provider_error"`,
  nullable), `createdAt`.

Run `pnpm --filter backend db:generate` to produce the migration SQL under
`apps/backend/drizzle/` — do not hand-write it. In the same (or a
follow-up) migration file, seed: `INSERT INTO plans (tier,
monthly_budget_cents) VALUES ('pro', 2000);` ($20.00). **Do not seed a
`'free'` row** — a missing `plans` row for `free` should read as "not
entitled to cloud AI" in the usage service (§Phase 2), not a $0 budget that
looks like a bug.

No dedicated schema test — this repo has no precedent for testing Drizzle
schema files directly; correctness is validated by Phase 2/4's mocked-`db`
tests.

---

## Phase 2 — Backend: pricing, plan lookup, usage service

New files under `apps/backend/lib/ai/`:

- **`models.ts`** — provider→gateway-namespace map (`claude`→`anthropic`,
  `gemini`→`google`, `openai`→`openai`, default `anthropic`) plus an
  allow-list of recognized model ids, rejecting anything unrecognized before
  it reaches `gateway()`. Model *alias* normalization (e.g.
  `claude-3-5-sonnet-online` → the real provider model id) stays in Rust —
  it already exists there (`llm_provider.rs::normalize_model_name`, see
  Phase 8) and shouldn't be duplicated; the backend only needs to map an
  already-canonical model id to a gateway namespace and validate it's known.
- **`pricing.ts`** — `MODEL_PRICING` keyed by gateway model id, covering the
  models reachable from `SettingAiProvider.tsx`'s online lists. Exported
  `computeCostCents(model, inputTokens, outputTokens)`.
- **`plans.ts`** — `getPlanForTier(tier)`, a thin `db.select().from(plans).where(eq(plans.tier, tier))`
  query; returns `null` for a tier with no row.
- **`usage.ts`**:
  - `getCurrentPeriodSpendCents(userId)` — reads `ai_usage_periods` for the
    current UTC month, `0` if no row.
  - `checkQuota(userId, tier)` — combines plan lookup + current spend;
    returns an ok/exceeded result. Called by the route **before**
    `streamText()`.
  - `recordUsage(userId, costCents)` — upsert into `ai_usage_periods`
    (`ON CONFLICT (user_id, billing_period) DO UPDATE SET cost_cents =
    cost_cents + excluded.cost_cents`) — called on both clean completion and
    mid-stream failure with partial usage (design doc §8).
  - `recordAiRequest({...})` — inserts one `ai_requests` row.

**Tests** (`lib/ai/usage.test.ts`, `pricing.test.ts`) — follow the existing
pattern exactly (`apps/backend/app/api/v1/auth/signup/route.test.ts` is the
reference): `vi.hoisted()` to build mock fns, `vi.mock("../../database", ()
=> ({...}))` before importing the module under test, assert on what the
mocked `db.insert`/`db.select` chains were called with. No real Postgres.

---

## Phase 3 — Backend: dependencies

- **Edit `apps/backend/package.json`** — add `"ai"` to `dependencies`
  (AI SDK v6+, per the earlier design discussion). Verify at install time
  whether Gateway routing needs an explicit `@ai-sdk/gateway` import or
  works via a plain `"anthropic/..."` string passed to `streamText()` when
  `AI_GATEWAY_API_KEY`/OIDC is configured — check whatever version resolves,
  same caution already flagged in the design doc for `MockLanguageModelV4`'s
  import path across `ai` package majors.
- **Edit `apps/backend/.env.example`** — add `AI_GATEWAY_API_KEY=""` with a
  short comment, matching the existing `RESEND_API_KEY` comment style.

No dedicated test; validated by Phase 4 actually importing and using `ai`.

---

## Phase 4 — Backend: the streaming route

**New file `apps/backend/app/api/v1/ai/complete/route.ts`**:

1. Parse JSON body: `{ token, prompt, system?, provider, model, structured? }`
   — **token in the body**, matching `desktop-session/route.ts`'s exact
   pattern (`const { token } = await request.json()`), not a Bearer header
   (no such convention exists anywhere in this codebase, on either side).
2. Look up the token the same way `desktop-session/route.ts` does:
   `db.select(...).innerJoin(users, eq(users.id, desktopSessions.userId)).where(eq(desktopSessions.token, token))`,
   check `expiresAt`. 401 on missing/invalid/expired token, same response
   shape as that route.
3. Server-side tier gate: free tier → 403 immediately. Don't trust the
   client — this must be enforced here even though the desktop already has
   `is_pro_tier` gating client-side (design doc's explicit "free tier
   shouldn't cost anything" requirement).
4. `checkQuota(userId, tier)` (Phase 2) — if exceeded, respond with a stream
   whose only line is
   `{"type":"error","code":"quota_exceeded","message":"...","retryable":false,"partial":false}`
   and never call `streamText()` (hard block, per design doc §7).
5. Resolve the gateway model id via `lib/ai/models.ts`; reject an
   unrecognized `provider`/`model` combination before calling the SDK.
6. `streamText({ model: gatewayModelId, prompt, system })`, iterate
   `fullStream`, translate each part into an NDJSON line
   (`text-delta` → `{"type":"delta","text":...}`), write to a
   `ReadableStream` response body (chunked transfer encoding).
7. On `finish`: `computeCostCents`, `recordUsage`, `recordAiRequest`
   (storing full `prompt`/`response` — the retention/opt-out policy from the
   design doc is explicitly deferred, not implemented here, but recording
   the content itself isn't blocked on it), emit `{"type":"done",...}`.
8. On error (Gateway 429, provider 5xx, network failure, etc.): map
   `statusCode === 429` → `rate_limited`; other failures → `provider_error`
   with `retryable` based on error class and `partial` based on whether any
   `delta` line was already written (track a local boolean). Record
   whatever partial usage was reported before the failure (design doc §8 —
   tokens already generated were already billed by the provider).

**Test `route.test.ts`** — same `vi.hoisted()`/`vi.mock()` structure as
`desktop-login/route.test.ts`, using `MockLanguageModelV4` +
`simulateReadableStream` from `ai`/`ai/test` in place of the real Gateway
call (mock the model-resolution step, e.g. via `vi.mock("../../../../../lib/ai/models",
...)`, so the mock model gets injected instead of a real gateway lookup).
Cases: missing/invalid token → 401; free tier → 403; quota exceeded →
single `quota_exceeded` line, `streamText` never called; normal `doStream`
completion → correct `delta`/`done` sequence + `recordUsage` called once
with the right cost; mid-stream error scripted into the chunk sequence →
`partial:true` line + partial-usage `recordUsage` call (verify the exact
mid-stream-error chunk shape against the installed `ai` version when
writing this — not confirmed in what was checked for the design doc).

---

## Phase 5 — Rust: propagate `backend_url` alongside the session token

**Problem found in exploration:** `load_active_provider` is called from 5
places (`indexer/mod.rs:297,362`, `query/mod.rs:60`,
`field_extraction.rs:75`, `cloud_transcribe.rs:54`) that only have
`AppHandle` — no `backend_url` parameter exists to reach them. The only
places that currently receive `backend_url` are `login_with_credentials`
and `verify_session` (both already take it as a param, sourced from the
frontend's `VITE_BACKEND_URL` per the existing "frontend is the single
source of truth for the backend URL" convention in `auth/mod.rs`). Rather
than threading a new parameter through 5 unrelated call sites, persist the
backend URL once, alongside the session, the same way the token already is.

**Edit `apps/desktop/src-tauri/src/auth/mod.rs`:**
- Add `backend_url: String` to `Session`.
- `read_session_internal`/`save_session_internal` read/write the new
  column.
- `login_with_credentials`/`verify_session` — both already receive
  `backend_url: String` as a parameter; start persisting it via
  `save_session_internal` (currently they just don't save it — this is
  additive, not a signature change to these two).
- `complete_oauth_login` gains a `backend_url: Option<String>` parameter.
  Source it from the deep-link handler in `lib.rs`; if the backend's own
  OAuth redirect (`doron-desktop://auth?token=...`) doesn't already include
  the backend's origin, add it there (the backend already knows its own
  origin — a small, low-risk addition on the backend side to the redirect
  URL construction).
- New `pub fn get_backend_url(app: &AppHandle) -> Option<String>` and `pub
  fn get_session_token(app: &AppHandle) -> Option<String>`, both following
  `is_pro_tier`'s exact shape (`read_session_internal(app).ok().flatten()`,
  mapped to the field needed).

**Edit `apps/desktop/src-tauri/src/store/mod.rs`** — add `backend_url TEXT`
to the `CREATE TABLE IF NOT EXISTS auth_session` DDL, plus an `ALTER TABLE
... ADD COLUMN` migration guard for existing installs (this table currently
has no such guard, but the neighboring `ai_configurations` table's
`voice_engine` column addition a few lines below is the pattern to copy —
check for the column via `pragma_table_info` before altering).

**Edit `apps/desktop/src-tauri/src/lib.rs`** — thread the extra
`backend_url` argument through the deep-link handler's existing call to
`complete_oauth_login`.

No new tests — `auth/mod.rs` has no existing test coverage to extend or
match (checked, none found); this is thin plumbing consistent with the
untested surrounding code.

---

## Phase 6 — Rust: NDJSON line parser (pure, unit-tested)

**New file `apps/desktop/src-tauri/src/llm/backend_stream.rs`:**

- `enum StreamEvent { Delta { text: String }, Done { finish_reason: String,
  input_tokens: Option<u32>, output_tokens: Option<u32> }, Error { code:
  String, message: String, retryable: bool, partial: bool,
  retry_after_seconds: Option<u32> } }`, deserialized via `serde` tagged on
  `"type"`.
- `struct LineBuffer` with `fn push(&mut self, bytes: &[u8]) ->
  Vec<Result<StreamEvent, String>>` — appends bytes to an internal buffer,
  splits complete lines on `\n`, parses each as one `StreamEvent`, retains
  any trailing partial line for the next call. This is what Phase 7 feeds
  from a `.chunk()` loop.

**Inline `#[cfg(test)] mod tests`** — matches the existing precedent
exactly (`llm/mod.rs`'s `clean_json` tests: pure function, synthetic
string/byte input, no network). Cover: one complete line in one `push`; one
line deliberately split across two `push` calls (simulating a real TCP
chunk boundary, since chunks won't respect JSON line boundaries); multiple
lines in one `push`; a `delta` line followed by an `error` line with
`partial:true`; malformed JSON on one line not poisoning subsequent lines.

---

## Phase 7 — Rust: `BackendOnlineProvider`

**New file `apps/desktop/src-tauri/src/llm/llm_provider_backend_online.rs`**
— same shape as `llm_provider_openai.rs`: a struct holding `backend_url`,
`session_token`, `provider`, `model`; `call_simple`/`call_structured` both
delegate to one internal method that POSTs
`{backend_url}/api/v1/ai/complete` with the JSON body from Phase 4 step 1,
then reads the response via a `while let Some(chunk) =
response.chunk().await` loop (matches the existing precedent in
`llm_local_mode.rs`'s model-download progress loop — **no new Cargo
feature needed**, `reqwest`'s `"stream"` feature is not required since
`.chunk()` is already used without it), feeding each chunk into Phase 6's
`LineBuffer::push`, accumulating `Delta` text until `Done` (return the
accumulated string) or `Error` (return `Err(...)`, formatted per the
convention below).

**Error convention:** `Result<String, String>` is the universal error
channel in this codebase — there's no structured error type anywhere, and
introducing one would ripple through every `LlmProvider` caller. Instead,
prefix the error string with the stable code:
`"QUOTA_EXCEEDED: <message>"`, `"RATE_LIMITED: <message>"`,
`"PROVIDER_ERROR: <message>"`. Every existing caller keeps working
unmodified (they already just display the string as-is); only Phase 9's
frontend change bothers to pattern-match the prefix.

**Edit `apps/desktop/src-tauri/src/llm/llm_provider.rs`** — register the
new module with the same `#[path = "..."] pub mod ...;` pattern used for
the sibling providers, and re-export `BackendOnlineProvider`.

No new test — matches the existing precedent exactly (none of
`ClaudeProvider`/`GeminiProvider`/`OpenAiProvider` have test coverage in
this repo; only the pure parser from Phase 6 is unit-tested).

---

## Phase 8 — Rust: wire it into `LlmProvider` and all three call sites that build a provider directly

**Edit `apps/desktop/src-tauri/src/llm/llm_provider.rs`:**
- Add `BackendOnline(BackendOnlineProvider)` to `enum LlmProvider`, with
  match arms in `call_simple`/`call_structured`.
- Make `normalize_model_name` `pub(crate)` so `llm_settings.rs` can reuse it
  (single source of truth for model-alias resolution — see Phase 2's note
  on not duplicating this in the backend).
- `get_active_provider`/`ProviderConfig` are **not** touched otherwise —
  `BackendOnlineProvider` needs `backend_url`/`session_token`, fields that
  don't belong on the shared `ProviderConfig` struct (byom/local don't need
  them); it's constructed directly at the three call sites below instead.

**Edit `apps/desktop/src-tauri/src/llm/llm_settings.rs`:**
- `load_active_provider` gains a new branch, checked *before* the existing
  generic fallback: `Some(config) if config.ai_mode == "online" => { ... }`
  — reads `auth::get_backend_url(app)` / `auth::get_session_token(app)`
  (Phase 5), normalizes the model via `normalize_model_name`, constructs
  `LlmProvider::BackendOnline(...)`. If either is missing (signed out, no
  cached backend URL), return an `Err` (e.g. `"Sign in to use Cloud AI."`)
  — callers already handle `Result<String,String>` generically, no
  caller-side change needed. The existing `ai_mode == "byom"` path falls
  through the generic branch **completely unchanged**.
- `check_ai_health` gains the identical `ai_mode == "online"` branch,
  placed after its existing `is_pro_tier` gate, in place of its current
  inline `get_active_provider(ProviderConfig{...})` construction for that
  case — still wrapped in the existing 10s timeout. Without this, the
  health-check button would keep testing the old direct-provider path even
  after online mode is proxied, silently validating a code path nothing
  else uses.
- Thread a `purpose: &'static str` parameter through `load_active_provider`
  so `ai_requests.purpose` (Phase 1) is meaningful rather than always
  `"chat"`. Each of the 5 call sites passes a literal:
  `indexer/mod.rs`'s two calls → `"doc_indexing"`, `query/mod.rs` →
  `"query_analysis"`, `field_extraction.rs` → `"field_extraction"`,
  `cloud_transcribe.rs` → `"chat"` (voice input doesn't map cleanly to the
  other categories). This is a one-argument mechanical addition per call
  site, not a logic change.

**Edit `apps/desktop/src-tauri/src/email/emails_orchestrate.rs`** —
`llm_provider_from_app` builds `ProviderConfig`/`get_active_provider`
directly, bypassing `load_active_provider` entirely (confirmed: it reads
`config.ai_mode`/`config.provider` and calls `get_active_provider` inline).
Give it the same `ai_mode == "online"` branch as `check_ai_health` —
otherwise email classification keeps silently using the pre-migration
direct-provider path forever.

**Edit `apps/desktop/src-tauri/src/llm/cloud_transcribe.rs`** —
`transcribe_via_provider`'s `match provider { ... }` is exhaustive with no
wildcard arm (confirmed — every other `LlmProvider` match site in this
codebase uses `_ => ...`, only this one doesn't). Adding
`LlmProvider::BackendOnline` **will not compile** without a new arm here.
Add: `LlmProvider::BackendOnline(_) => Err("Voice input isn't supported in
backend-proxied online mode yet.".to_string())` (voice transcription is a
separate concern from `/api/v1/ai/complete`, explicitly out of scope here).

No new tests — none of `load_active_provider`/`check_ai_health`/
`llm_provider_from_app` have existing coverage to extend (confirmed, none
found); this phase is validated by Phase 6's isolated parser tests plus
manual end-to-end verification (see Verification section below).

---

## Phase 9 — Frontend: differentiate quota-exceeded from generic failure

**Edit `apps/desktop/src/components/Settings/SettingAiProvider.tsx`** — in
`handleHealthCheck`'s `catch`, check
`err.toString().startsWith("QUOTA_EXCEEDED:")` and set an additional
`quotaExceeded: true` field on the object passed to `setHealthCheckResult`
(additive to the existing `{success, message, modelName, providerName,
mode}` shape).

**Edit `apps/desktop/src/components/Settings/SettingAiHealthCheckResult.tsx`**
— when `result.quotaExceeded` is true, render an "Upgrade to Pro" CTA
instead of (or alongside) the generic red banner, reusing the existing
pattern from `apps/desktop/src/components/App/AppHome.tsx`'s
`handleUpgrade()` (`openUrl(`${BACKEND_URL}/register/plan?platform=desktop`)`)
and matching the tone of `apps/desktop/src/lib/voiceCapability.ts`'s
existing Pro-upsell string.

**`apps/desktop/src/store/aiStore.ts::triggerGlobalHealthCheck`** — leave
untouched. It's the automatic startup check and already silently swallows
all errors (`console.error` only) — the design doc's "explicit user action"
requirement for quota exhaustion belongs on the user-triggered health-check
button, not the background check nobody is watching.

No new tests — no existing coverage for these components to extend; this is
a small, visually-verifiable change.

---

## Phase 10 — Rust: decouple metadata extraction strategy from `is_local`

**Context (surfaced during plan review, not part of the original design
doc scope):** local AI mode was already removed from the desktop Settings
UI (AMI-65) while the underlying code (`LlmProvider::Local`, `is_local`
checks) stays in place. `indexer/mod.rs`'s `index_file` and `index_folder`
currently decide heuristic-vs-LLM metadata extraction via `is_local`
(confirmed: `let is_local = match &provider { LlmProvider::Local(_) =>
true, _ => false };`, feeding `IndexOptions.run_llm_metadata`), which is
now a vestigial signal rather than a deliberate choice — it should be
decoupled entirely.

**Edit `apps/desktop/src-tauri/src/indexer/mod.rs`:**
- Add `pub const USE_HEURISTIC_METADATA_ONLY: bool = true;` — matches the
  existing `query/mod.rs::USE_FTS_ONLY` precedent exactly (a hardcoded,
  developer-flippable constant, not a settings-UI toggle or config value).
  **Default `true`** (force heuristic) — matches `USE_FTS_ONLY`'s existing
  default of forcing the cheap/deterministic path, keeps indexing free of
  any LLM cost (including cost through the new backend proxy) until
  deliberately flipped.
- In both `index_file` and `index_folder`, remove the `is_local`
  computation (confirmed unused for anything else at either call site) and
  change `run_llm_metadata: !is_local && crate::auth::is_pro_tier(&app)` to
  `run_llm_metadata: !USE_HEURISTIC_METADATA_ONLY &&
  crate::auth::is_pro_tier(&app)`. The existing `is_pro_tier` gate is
  unchanged — this flag controls extraction *strategy*, not the Pro-tier
  paywall on LLM-based extraction.
- No change to `index_file_core`/`IndexOptions` itself — `run_llm_metadata`'s
  downstream consumption (the `if options.run_llm_metadata { ... } else`
  falling back to `extract_heuristic_metadata(...)`) is unaffected, only
  what feeds into it changes.

Touches `indexer/mod.rs`, already being edited in Phase 8 for the
`purpose` parameter — same file, unrelated change, can be done in the same
pass or separately. No new tests (no existing coverage for this logic to
extend); validated by Verification item 6 below.

---

## Verification

1. **Automated**: `pnpm --filter backend test` (Vitest — Phase 2 and Phase 4
   tests) and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
   (Phase 6's `backend_stream` unit tests; confirm the crate still compiles
   cleanly with the new `LlmProvider` variant, i.e. Phase 8's
   `cloud_transcribe.rs` fix actually resolves the exhaustiveness error).
2. **Manual, end-to-end**: run `pnpm dev` (backend + desktop together), sign
   in on desktop with a Pro-tier test account, set AI mode to `online` in
   Settings, run a document indexing pass or a query — confirm it succeeds
   via the backend proxy (check backend server logs and/or the AI Gateway
   dashboard for the call, not a direct provider log). Trigger the manual
   "Run Health Check" button in Settings and confirm it also goes through
   the backend now (not the old direct path).
3. **Quota path**: manually set a test user's `ai_usage_periods.cost_cents`
   above their plan's `monthly_budget_cents` in the DB, retry a request,
   confirm the desktop surfaces the upgrade CTA (Phase 9) rather than a
   generic error, and confirm no provider call was made (check
   `ai_requests` — no new row, or Gateway dashboard shows no new request).
4. **Regression check on `byom`/`local`** — since `load_active_provider` is
   being modified, explicitly re-test both BYOM (custom endpoint + own key)
   and local mode (bundled `llama-server`) end-to-end to confirm they're
   genuinely unaffected, not just "should be unaffected by inspection."
5. **Mid-stream failure**: with a scripted/mocked provider failure (or by
   temporarily pointing the Gateway model at an invalid id), confirm the
   desktop receives a `PROVIDER_ERROR:` string rather than hanging or
   crashing, and that `ai_requests` records whatever partial token usage
   occurred.
6. **Metadata extraction flag**: with `USE_HEURISTIC_METADATA_ONLY = true`
   (default), index a document as a Pro-tier user and confirm no LLM call
   is made (heuristic metadata only — no new `doc_indexing`-purpose row in
   `ai_requests`). Flip to `false`, re-index, confirm LLM metadata
   extraction now runs through the backend proxy (a `doc_indexing` row
   appears).
