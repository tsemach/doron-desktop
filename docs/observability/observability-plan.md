# Observability: PostHog + Sentry Integration

## Context

`observability.md` (repo root) is a research doc recommending PostHog + Sentry
for this hybrid Tauri-desktop + Next.js-backend app, but nothing is wired up
yet — no SDKs, no error boundary, no Rust panic hook, no `instrumentation.ts`.
The app has three runtime surfaces that currently produce zero telemetry:
the Rust native process, the Tauri React webview, and the Vercel-hosted
Next.js backend (including the two AI proxy routes,
`/api/v1/ai/complete` and `/api/v1/ai/transcribe`).

This plan wires up Sentry (error/crash tracking, all three surfaces) and
PostHog (product analytics + LLM observability, backend + desktop web) as
real, provisioned integrations — not placeholder env vars. Confirmed via
`vercel integration categories`/`discover`: both `sentry` (category
`observability`) and `posthog` (category `analytics`) are native Vercel
Marketplace integrations for `apps/backend`. The Tauri desktop app isn't a
Vercel project, so it needs its own Sentry project + PostHog client key,
provisioned manually.

**Two deliberate decisions, since this is a legal case-management app
handling privileged client data:**
- **PostHog session replay: disabled entirely.** The desktop webview
  displays case/document/client content; screen recordings leaving the
  device is not an acceptable default here, so replay stays off rather than
  masked (masking is inherently incomplete — anything not explicitly
  selector-matched still leaks).
- **PostHog LLM tracing: full prompt/response content capture** (explicit
  user choice, understanding this sends real prompt/completion text —
  potentially containing case/email content — to PostHog's servers, same
  data class that's already stored unredacted in `ai_requests.prompt`/
  `response` per `schema.ts`'s own comment acknowledging no
  retention/redaction policy exists yet).

Single Linear issue, single branch, single PR — no phase-stacking (unlike
the AMI-78 voice-transcription work this session).

Sentry project split: **3 separate projects** (`ascurix-backend`,
`ascurix-desktop-web`, `ascurix-desktop-native`) — different platforms
(Next.js / browser JS / Rust), different release cadences (Vercel
continuous deploys vs. versioned Windows installers), free-tier quota is
org-wide not per-project, so splitting costs nothing and keeps "which
surface is this bug in" answerable from the project list alone. Naming
uses "ascurix" (the org's new name — PostHog org already created under
that name), not "amicus" — repo/directory/package identifiers stay
`doron-desktop`/`com.tsemach.doron-desktop` per the existing
`project-naming.md` rule; this only affects new external-service naming.

## Implementation Steps

### 1. Docs
Move the existing root `observability.md` into
`docs/observability/recommendations.md` (the original research doc,
unchanged). This plan file (`docs/observability/observability-plan.md`)
becomes the living implementation doc — update it as steps complete,
including the BYOM/local LLM-tracing gap noted in step 7 below.

### 2. Provisioning (manual — Vercel Marketplace native install requires a Pro team plan)
Repo is linked to Vercel at the repo root (`.vercel/repo.json`, project
`doron-desktop`, team `tsemach-mizrachis-projects`) — confirmed working,
no `vercel link` needed. Vercel's native Marketplace install for both
Sentry and PostHog failed with `Missing billingPlanId for
installation-only plan integration` even after accepting terms with an
explicit free plan (`am3_f`) and valid payment method on file — root
cause is almost certainly that Marketplace provisioning for these
integrations requires the Hobby→Pro upgrade ("Observability tools" is
listed as a Pro-only checkmark on the billing page). Decided to skip the
paid upgrade and provision manually instead — same end result for the
app code, since it only ever reads a DSN/API key regardless of how it was
obtained.

Data region decided: **EU** for both (Sentry: Germany-hosted org; PostHog:
EU cloud instance, `eu.posthog.com` not `app.posthog.com`).

**Sentry — your action (sentry.io):**
- Sign up / log in, create an organization named "Ascurix", region EU
  (irreversible once set).
- Create 3 projects under it:
  - `ascurix-backend` — platform Next.js
  - `ascurix-desktop-web` — platform React
  - `ascurix-desktop-native` — platform Rust
- Each project gives a DSN (not secret, safe to share) on its "Getting
  Started" page. The Next.js project's setup also offers an **Auth
  Token** (for source-map uploads) — that one *is* a secret; add it
  directly via `vercel env add SENTRY_AUTH_TOKEN` rather than sharing it.

**PostHog — your action (already partially done):**
- Confirm the existing "Ascurix" org is on the EU instance
  (`eu.posthog.com`) — if it was created on `app.posthog.com` (US) by
  default, region can't be changed after the fact; may need to recreate
  the project on the EU instance.
- From Project Settings, grab the **Project API Key** (`phc_...`, not
  secret, client-safe) for the browser/desktop SDKs, and a **Personal API
  Key** for `posthog-node`/`posthog-ai` server-side use (this one *is*
  secret — add via `vercel env add POSTHOG_PERSONAL_API_KEY`, don't
  share it in chat).

**Then:** add the non-secret values (Sentry DSNs ×3, PostHog project API
key) as Vercel env vars (`vercel env add`, or paste values here and I'll
add them) and desktop `.env` values; add the two secrets
(`SENTRY_AUTH_TOKEN`, `POSTHOG_PERSONAL_API_KEY`) directly via
`vercel env add <NAME>` yourself.

### 3. Backend — Sentry (`apps/backend`)
- Run `npx @sentry/wizard@latest -i nextjs --saas --org <org> --project ascurix-backend --coming-from vercel`
  from `apps/backend`. Review generated config files (exact filenames
  depend on current SDK version — recent `@sentry/nextjs` consolidates
  around `instrumentation.ts`/`instrumentation-client.ts`; verify at
  implementation time) and the `next.config.js` wrap (`withSentryConfig`).
- Add a `beforeSend` hook in the generated server config that strips
  `prompt`/`response`/request-body fields from error context — the
  `/complete` and `/transcribe` routes' payloads carry the same sensitive
  content already flagged as unredacted in `schema.ts`; error breadcrumbs
  must not become an uncontrolled second copy of it.

### 4. Backend — PostHog (`apps/backend`)
- `pnpm add posthog-js posthog-node posthog-ai` (verify `posthog-ai`
  compatibility with the installed `ai` package version, `^7.0.35`, at
  implementation time — flag and adjust if the wrapper API differs).
- `lib/posthog/server.ts` — Node client singleton for server-side capture
  (auth events, quota-exceeded, etc.), following the existing
  `lib/ai/*.ts` singleton/module pattern already in this directory.
- `app/providers.tsx` (new) — client-side `posthog-js` init + provider,
  wrapped around `children` in `app/layout.tsx`.
- Wrap the `model` argument passed to `streamText`/`generateText`/
  `transcribe` in `app/api/v1/ai/complete/route.ts` and
  `app/api/v1/ai/transcribe/route.ts` with `posthog-ai`'s tracing wrapper —
  full content capture per the decision above (no redaction config beyond
  whatever `posthog-ai` does by default, since default should already
  include content). Confirm `userId`/`distinctId` gets threaded through
  (already available as `session.userId` at both call sites via
  `authorizeRequest`, from the AMI-78 work) so traces are attributable per
  user.

### 5. Desktop React (`apps/desktop`)
- `pnpm add posthog-js @sentry/react`.
- `src/lib/observability.ts` (new) — init both SDKs, reading
  `import.meta.env.VITE_*`, matching the existing `VITE_BACKEND_URL`
  convention in `src/store/authStore.ts`. PostHog init sets
  `disable_session_recording: true` explicitly. Sentry init sets a modest
  `tracesSampleRate` (not 100% — free-tier/cost hygiene).
- Call the init function once, early in `src/main.tsx`.
- Wrap `<App />` in `src/main.tsx` with Sentry React's built-in
  `Sentry.ErrorBoundary` component (reuse, don't hand-roll — no error
  boundary exists in this codebase today).
- New `apps/desktop/.env.example` documenting `VITE_SENTRY_DSN`,
  `VITE_SENTRY_ENVIRONMENT`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`.

### 6. Desktop Rust (`apps/desktop/src-tauri`)
- Add `sentry` crate to `Cargo.toml` (panic integration is enabled by
  default on `sentry::init`).
- In `src/lib.rs::run()`, call `sentry::init(...)` before
  `tauri::Builder::default()...` — DSN sourced via `option_env!` at build
  time (DSNs aren't secret, same public-key treatment as PostHog's client
  key; exact mechanism — build-time `env!` vs. a bundled config value — to
  settle at implementation time).
- Add explicit `sentry::capture_message` calls at a few real failure
  points, since panics are rare in this codebase (dominant convention is
  `Result<T, String>` via `?`, not panics) — candidates: `store::open_db`
  failure, `indexer::index_folder`/`index_file` unrecoverable failure,
  `email::poll_emails_background`'s background-loop failure path. Exact
  set to confirm by re-reading those modules at implementation time.

### 7. Known limitation to document (not build)
BYOM/local-mode voice and chat calls go directly from Rust to the provider
(`llm_provider_gemini.rs`, `llm_provider_openai.rs`, etc.), bypassing the
backend entirely — those are structurally invisible to PostHog's LLM
tracing, which only wraps the backend's AI SDK calls. Only "online" mode
(backend-proxied) gets full LLM observability. Document this in this file
rather than building Rust-side manual tracing for it now.

## Verification

- Backend: trigger a Sentry test error (wizard's example page or a thrown
  error in a scratch route), confirm it lands in `ascurix-backend`. Make a
  real `/complete` or `/transcribe` call in dev, confirm a PostHog LLM
  trace appears with prompt/response content. `npx tsc --noEmit` clean.
- Desktop React: throw a test error from a button handler, confirm it's
  captured in `ascurix-desktop-web` via the error boundary. Confirm a
  PostHog event fires with no session recording present in the PostHog
  dashboard. `npx tsc --noEmit` clean.
- Desktop Rust: temporarily trigger a `panic!()` via a debug-only path, run
  in dev, confirm the event lands in `ascurix-desktop-native`, then remove
  the trigger. `cargo check --lib` clean.
- End-to-end: confirm no session replay data appears anywhere in PostHog
  after normal desktop app usage.
