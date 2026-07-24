# Implementation Plan: Backend-Proxied Voice Transcription

## Context

Tracked as **AMI-78**. Follows directly from the merged AMI-67 work
(`implementation_plan.md`), which explicitly deferred voice transcription —
`cloud_transcribe.rs` has a placeholder error for `LlmProvider::BackendOnline`
instead of a real implementation. The architecture, protocol, and decisions
are recorded in `voice_transcription_architecture.md` — that document is the
settled *why*; this plan is the *how*, against the actual merged codebase
(verified via direct exploration: `BackendOnlineProvider`,
`auth::get_backend_url`/`get_session_token`, and the online-mode branch in
`load_active_provider` already exist and are reused unmodified here — this
plan does not re-build any of AMI-67's auth/provider plumbing).

**Verified gaps that shape this plan, not assumed from the design doc alone:**
neither `transcribe_audio_cloud` nor `extract_field_value` can reach
`BackendOnline` today — both always take an explicit `Some(provider)` from
their one real caller (`VoiceFieldFiller.tsx`), which forces the
BYOM-shaped `get_active_provider` path unconditionally; the `None` branch
that *would* resolve online mode is dead code for voice. OpenAI's Rust
`transcribe()` hardcodes `"whisper-1"`, ignoring the configured model — the
backend replacement preserves that, it does not fix it (design doc §3.4).

## Sequencing

```
Backend:  Phase 1 (schema) → Phase 2 (pricing/models) → Phase 3 (route)
Rust:     Phase 4 (transcribe() + shared mode-resolution helper) → Phase 5 (wiring)
Frontend: Phase 6 — depends on Phase 5's mode-resolution helper existing
```

Backend (1→3) and Rust Phase 4 have no dependency on each other and can be
built in either order. Phase 5 (wiring the helper into the two call sites)
hard-depends on Phase 4 (needs the helper + `transcribe()` to exist) and
Phase 3 (needs the real route to call). Phase 6 depends on Phase 5's helper
being callable from the frontend's perspective (i.e. the Tauri commands'
signatures are final).

## Branching & PR Strategy

Tracked in Linear as **AMI-78** (parent — holds this plan's full content),
with one sub-issue per phase nested under it, same convention as AMI-67.

```
master
 ← PR0
   ← phase-1
     ← phase-2
       ← phase-3
         ← phase-4
           ← phase-5
             ← phase-6   (top of the stack)
```

**Merge order:** phase-6 → phase-5 → phase-4 → phase-3 → phase-2 → phase-1
→ PR0 → master.

---

## Phase 1 — Backend: schema migration for `voice_transcription` purpose

**Edit `apps/backend/database/schema.ts`** — add `"voice_transcription"` to
`ai_requests.purpose`'s enum, alongside the existing `chat` /
`email_classification` / `field_extraction` / `doc_indexing` /
`query_analysis`. Run `pnpm --filter backend db:generate` to produce the
migration under `apps/backend/drizzle/` — do not hand-write it.

No dedicated test — matches AMI-67 Phase 1's precedent (no schema-file test
convention exists in this repo); correctness is validated by Phase 3's
mocked-`db` route test asserting `recordAiRequest` was called with
`purpose: "voice_transcription"`.

---

## Phase 2 — Backend: transcription model resolution + pricing

**Edit `apps/backend/lib/ai/models.ts`** — add:
```ts
export function resolveTranscriptionModel(provider: string, model: string): string | null
```
- `provider === "openai"` → always returns the Gateway transcription id for
  Whisper (e.g. `"openai/whisper-1"`), **ignoring the passed `model`
  entirely** — this is not a bug to fix here, it's preserving exactly what
  `llm_provider_openai.rs::transcribe()` already does today (hardcodes
  `"whisper-1"` in the multipart form regardless of `self.model` — confirmed
  by reading that file). Document this inline with a comment pointing at
  that fact, since it's non-obvious and easy to "fix" by accident later.
- `provider === "gemini"` → delegates to the existing `resolveGatewayModel("gemini", model)`
  (transcription is a `generateText` call for Gemini, not a dedicated
  transcription model — see design doc §3.4/§5.1). Returns `null` if the
  model isn't already in `MODELS_BY_NAMESPACE.google` — **verify
  `gemini-3.1-flash-lite`/`gemini-3.5-flash` (the two ids
  `SettingVoiceEngine.tsx`'s `VOICE_CLOUD_MODELS.gemini` actually offers)
  are present in that list before assuming this just works** (design doc
  §13 flags this as unconfirmed).
- Any other provider → `null` (reject).

**Edit `apps/backend/lib/ai/pricing.ts`** — add:
```ts
export function computeTranscriptionCostCents(provider: string, durationSeconds: number, inputTokens?: number, outputTokens?: number): number
```
- `provider === "openai"` → `durationSeconds` × Whisper's per-minute rate
  (verify the current rate against OpenAI's live pricing page at
  implementation time — flagged as unverified in the design doc §13, same
  caveat the existing `pricing.ts` file already documents for its other
  entries).
- `provider === "gemini"` → delegates to the existing `computeCostCents`
  using `inputTokens`/`outputTokens` (real token usage from the
  `generateText` call, same as any other Gemini request through
  `/complete`).
- Round up, never down (matches `computeCostCents`'s existing rationale —
  under-counting spend lets cumulative usage drift above budget).

**Tests** (`lib/ai/models.test.ts`, extend or create `pricing.test.ts`
alongside the existing `usage.test.ts`/`pricing.test.ts` if not already
covering this) — assert: OpenAI resolution ignores the passed model and
always returns the Whisper id; Gemini resolution rejects a model not in the
allowlist; `computeTranscriptionCostCents` duration math for OpenAI; token
math for Gemini delegates correctly to `computeCostCents`.

---

## Phase 3 — Backend: the transcription route

**New file `apps/backend/app/api/v1/ai/transcribe/route.ts`**:

1. Parse JSON body: `{ token, audioBase64, mimeType, provider, model, language?, purpose? }`.
   Reject missing `token`/`audioBase64`/`mimeType`/`provider`/`model` with
   400, same shape as `/complete`'s `validateRequestBody`.
2. Auth: identical lookup to `/complete`'s `authorizeRequest` — literally
   reuse that function (both routes need `db.select(...).innerJoin(users, ...).where(eq(desktopSessions.token, token))`,
   401 on missing/expired, 403 on non-pro tier). Factor it into a shared
   helper (e.g. `lib/ai/auth.ts`) if it isn't already trivially importable
   from `/complete/route.ts` — don't duplicate the query.
3. `resolvePurpose` — reuse `/complete`'s helper, extended for the new
   `"voice_transcription"` value (Phase 1); default to `"voice_transcription"`
   here rather than `"chat"` if `purpose` is omitted (this route's whole
   reason for existing is transcription, unlike `/complete` which serves five
   different purposes).
4. Resolve the model via `resolveTranscriptionModel` (Phase 2); 400 on an
   unrecognized provider/model combination, same convention as `/complete`.
5. `checkQuota(userId, tier)` — same hard block as `/complete`, before any
   provider call.
6. Dispatch on `provider`:
   - **`openai`**: `transcribe({ model: gateway.transcription(resolvedModel), audio: Buffer.from(audioBase64, 'base64') })`
     from the `ai` package. On success, get `.text` and `.durationInSeconds`
     from the `TranscriptionResult`.
   - **`gemini`**: `generateText({ model: gateway(resolvedModel), messages: [{ role: 'user', content: [{ type: 'file', mediaType, data: Buffer.from(audioBase64, 'base64') }, { type: 'text', text: transcriptionInstruction(language) }] }] })`
     where `transcriptionInstruction` mirrors the exact instruction string
     `llm_provider_gemini.rs::transcribe()` already uses ("Transcribe this
     audio exactly as spoken..."/"...in {language}..."). Get `.text` and
     `.usage.{inputTokens,outputTokens}` from the result.
7. On success: compute cost via `computeTranscriptionCostCents` (provider-
   branched, Phase 2), `recordUsage`, `recordAiRequest` (purpose
   `"voice_transcription"`, `response` = the transcript — same content-
   logging shape `/complete` already uses, same open compliance question
   the original design doc raised in its own §9, not re-litigated here),
   return `Response.json({ text })`.
8. On error: same `rate_limited`/`provider_error` mapping as `/complete`'s
   `handleStreamError` (429 → `rate_limited`, else `provider_error`), but
   returned as a single JSON error response (no NDJSON — design doc §6),
   e.g. `Response.json({ error: { code, message, retryable } }, { status: ... })`.
   Record the failed attempt via `recordAiRequest` with `errorCode` set,
   same as `/complete`.

**Test `route.test.ts`** — same `vi.hoisted()`/`vi.mock()` structure as
`/complete/route.test.ts`. Use `MockTranscriptionModelV4` (confirmed
exported from `ai/test`, design doc §10) for the OpenAI path and the
existing `MockLanguageModelV4` pattern for the Gemini path. Cases:
missing/invalid token → 401; free tier → 403; quota exceeded → error
response, model never called; OpenAI success → `{ text }` + duration-based
`recordUsage` call; Gemini success → `{ text }` + token-based `recordUsage`
call; provider failure (both paths) → mapped error code + `recordAiRequest`
with `errorCode` set.

---

## Phase 4 — Rust: `BackendOnlineProvider::transcribe()` + shared mode-resolution helper

**Edit `apps/desktop/src-tauri/src/llm/llm_provider_backend_online.rs`** —
add:
```rust
pub async fn transcribe(&self, audio_bytes: Vec<u8>, mime_type: &str, language: Option<&str>) -> Result<String, String>
```
POSTs to `{backend_url}/api/v1/ai/transcribe` with
`{ token, audioBase64: STANDARD.encode(&audio_bytes), mimeType: mime_type, provider: self.provider, model: self.model, language, purpose: self.purpose }`
(base64 encoding matches the existing convention already used for Gemini in
`llm_provider_gemini.rs` — design doc §6). Unlike `stream_and_buffer`, this
is a **single JSON response**, not an NDJSON stream — `response.json()`
into `{ text: String }` on success, or parse the `{ error: { code, message, retryable } }`
shape into the same `"CODE: message"` string convention `call_simple`/
`call_structured` already use (uppercase `code`, same as
`stream_and_buffer`'s existing NDJSON-error handling — reuse that
uppercasing logic rather than re-deriving it).

**New shared helper, `apps/desktop/src-tauri/src/llm/llm_settings.rs`**:
```rust
pub fn resolve_voice_provider(
    app: &AppHandle,
    provider_type: String,
    api_key: String,
    model: Option<String>,
) -> Result<LlmProvider, String>
```
- `api_key.trim().is_empty()` → **online**: same shape as
  `load_active_provider`'s existing online branch (`auth::get_backend_url`/
  `get_session_token`, error `"Sign in to use Cloud AI."` if either is
  missing), constructing `LlmProvider::BackendOnline` with
  `purpose: "voice_transcription"` for the transcription caller and
  `purpose: "field_extraction"` for the extraction caller (see Phase 5 —
  this function takes `purpose` as a parameter rather than hardcoding it,
  since it's shared between the two call sites).
- Non-empty `api_key` → **BYOM**, i.e. exactly today's
  `get_active_provider(ProviderConfig { provider_type, api_key, model: model.unwrap_or_default(), base_url: None })`.

This replaces the duplicated `Some(provider_type) => get_active_provider(...)`
arm in both `cloud_transcribe.rs::transcribe_audio_cloud` and
`field_extraction.rs::extract_field_value` — see Phase 5.

No new test for `transcribe()` itself — matches `stream_and_buffer`'s
existing precedent (no test coverage, real network call). Add a unit test
for `resolve_voice_provider`'s branch logic (empty vs. non-empty key →
online vs. BYOM) — this is pure logic, cheaply testable, and is new
behavior this plan introduces (not just plumbing).

---

## Phase 5 — Rust: wire the helper into both call sites

**Edit `apps/desktop/src-tauri/src/llm/cloud_transcribe.rs`**:
- `transcribe_audio_cloud`'s `match provider { Some(...) => ..., None => ... }`
  becomes a call to `resolve_voice_provider(&app, provider_type, api_key, model)`
  when a voice-specific provider is given (i.e. keep the function's
  existing parameter shape — `provider: Option<String>` — but route the
  `Some` case through the new helper instead of straight to
  `get_active_provider`). The `None` fallback (`load_active_provider`, main
  config) stays unchanged for any future non-voice caller.
- `transcribe_via_provider`'s `LlmProvider::BackendOnline(_) => Err(...)`
  arm becomes `LlmProvider::BackendOnline(p) => p.transcribe(audio_bytes, &mime_type, language.as_deref()).await`.
  **Mime type**: today's command only receives raw `audio_bytes` with no
  explicit mime type (Gemini's direct path hardcodes `"audio/wav"` at the
  call site in `transcribe_via_provider`, since `VoiceFieldFiller.tsx`
  always sends WAV via `blobToWav16kMono`/converts before calling — reuse
  that same hardcoded `"audio/wav"` for the new backend call rather than
  threading a new parameter through, since every caller already guarantees
  WAV).
- Update the existing `#[cfg(test)] mod tests`' 
  `test_backend_online_returns_explicit_unsupported_error` — it currently
  asserts an error string; replace it with a test asserting the
  `BackendOnline` arm is reachable and no longer hardcoded to fail (exact
  assertion depends on whether a mock HTTP layer is introduced — if not,
  this test may need to become an integration-style test or be removed if
  it can no longer assert anything meaningful without a live/mocked
  backend; decide at implementation time, don't leave a stale assertion
  that no longer reflects reality).

**Edit `apps/desktop/src-tauri/src/llm/field_extraction.rs`**:
- Same treatment: `extract_field_value`'s `Some(provider_type) => get_active_provider(...)`
  arm becomes `Some(provider_type) => resolve_voice_provider(&app, provider_type, api_key, model)?`.
  The `None` branch (`load_active_provider`, `"field_extraction"` purpose)
  is unchanged — still what the local voice engine and any non-voice caller
  use.

No new tests beyond Phase 4's `resolve_voice_provider` unit test — these two
edits are call-site wiring, validated by Phase 4's logic test plus manual
end-to-end verification (§Verification below).

---

## Phase 6 — Frontend: enable online mode for voice, update capability gating

**Edit `apps/desktop/src/lib/voiceCapability.ts`** — `checkVoiceCapability`'s
cloud branch currently disables voice outright without an API key. Change
to: no key → check Pro tier + signed-in (mirroring how the main AI
Provider's online mode is gated), enabled if so; key present → enabled
(BYOM, unchanged). Update `VoiceCapabilityResult`'s reason strings
accordingly (the current "Voice input needs a cloud provider and API key
set in Settings..." message becomes wrong once the no-key case is a valid,
supported state).

**Edit `apps/desktop/src/components/ui/VoiceFieldFiller.tsx`** — no change
needed to the `invoke("transcribe_audio_cloud", ...)`/`invoke("extract_field_value", ...)`
call shape itself (both already pass `provider`/`apiKey`/`model` — Phase 5's
Rust-side `resolve_voice_provider` is what changes behavior for an empty
`apiKey`, not the frontend's call signature). Verify this assumption holds
once Phase 5 lands — if the Rust command signatures changed in a way that
needs a new argument (e.g. explicit mode), update the call sites here
accordingly.

**Edit `apps/desktop/src/components/Settings/SettingVoiceEngine.tsx`** — the
existing `handleVoiceCloudHealthCheck`'s `mode = byomOpen ? "byom" : "online"`
logic was already doing real online/BYOM selection for the health check;
no change needed there. The "Test Transcription" widget
(`handleTestCloudRecording`) currently always calls `transcribe_audio_cloud`
with `apiKey: voiceCloudApiKey` — if the user hasn't entered a key yet, this
already naturally exercises the new online path once Phase 5 lands (empty
string → `resolve_voice_provider` treats it as online). Verify the "Add an
API key above to enable voice input" warning banner (shown when
`!voiceCloudApiKey.trim()`) is updated or removed — it directly contradicts
online mode being usable without a key.

No new tests — no existing test coverage for these three files to extend
(consistent with AMI-67 Phase 9's precedent); validated by manual
verification (below).

---

## Verification

1. **Automated**: `pnpm --filter backend test` (Vitest — Phase 2/3 tests)
   and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
   (Phase 4's `resolve_voice_provider` unit test; confirm the crate still
   compiles with `cloud_transcribe.rs`'s updated match arm).
2. **Manual, end-to-end — online mode, no BYOM key**: sign in on desktop
   with a Pro-tier test account, in Settings → Voice Input Engine leave the
   API key field empty, select each provider (Gemini, OpenAI) in turn,
   record a test clip via "Test Transcription," confirm a transcript comes
   back via the backend proxy (check backend server logs / AI Gateway
   dashboard for the call, not a direct provider request) for both
   providers.
3. **Manual — real field-filling flow**: in Document Fields or New Case,
   with voice engine set to "cloud" and no API key configured, use the mic
   button end-to-end (record → transcribe → extract → confirm → apply) and
   confirm it succeeds via the backend.
4. **Regression — BYOM voice unaffected**: set a real API key in Voice
   Input Engine settings, repeat both the health check and a live
   field-filling flow, confirm it still calls the provider directly (no
   backend involvement) exactly as before this change.
5. **Quota path**: manually push a test user's `ai_usage_periods.cost_cents`
   over budget, attempt a voice transcription, confirm the desktop surfaces
   the same upgrade-prompt behavior chat/health-check already do (Phase 9
   of AMI-67), and confirm no `ai_requests` row with a real cost was
   created for the blocked attempt.
6. **Cost sanity**: after a successful OpenAI transcription, confirm the
   recorded `ai_requests.cost_cents` is duration-derived (roughly
   proportional to clip length, not token count); after a successful
   Gemini transcription, confirm it's token-derived (comparable magnitude
   to a normal Gemini chat request of similar output length).
7. **Local voice unaffected**: confirm `transcribe_audio_local` (whisper
   sidecar) still works with no code path changes — this plan never touches
   `llm_local_mode.rs` or the local branch of `cloud_transcribe.rs`.

## Known Gaps / Not Yet Supported (carried forward, or newly surfaced)

- **Streaming/live-partial transcription** — explicitly out of scope (design
  doc §2). Gateway's `experimental_transcription` WebSocket surface exists
  but nothing in this plan uses it.
- **OpenAI voice model dropdown still doesn't control the real transcription
  model** — preserved intentionally (design doc §3.4/§13), not fixed here.
  A future PR could route through Gateway's newer `gpt-4o-transcribe`/
  `gpt-4o-mini-transcribe` models instead of hardcoded legacy Whisper, and/or
  make the settings UI honest about what the dropdown actually controls per
  provider — both deferred as separate product/UX work.
- **Whisper per-minute pricing figure** unverified against OpenAI's live
  pricing page as of writing (design doc §13) — verify before relying on it
  for real billing enforcement, same caveat already carried by the rest of
  `pricing.ts`.
