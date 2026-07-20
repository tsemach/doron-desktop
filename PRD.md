# Amicus — Product Requirements Document

Status: Draft v1 — 2026-07-20
Owner: Tsemach Mizrachi

Naming note: the product is **Amicus**. "Doron Desktop" was the working name before the rename and still names the physical repo, local directory, app identifier (`com.tsemach.doron-desktop`), and the `doron-desktop://` deep-link scheme referenced below — those stay as-is until manually migrated.

## 1. Mission

Provide a comprehensive, local-first working environment for lawyers and attorneys — a single platform covering the full lifecycle of a legal case: intake, document drafting, case correspondence, research, and (long-term) case strategy simulation. The product should let a solo practitioner or small firm run their practice without stitching together a document manager, an email client, and a template library by hand.

## 2. Product shape (as built today)

Two apps in one monorepo, and this split matters for almost every requirement below:

- **`apps/desktop/`** — Tauri v2 desktop client (React/TS + Rust). This is where the actual practice happens: case management, document indexing/search, templates, email ingestion, local/cloud AI. All data lives in a **per-machine local SQLite database** — there is no server sync today.
- **`apps/backend/`** — Next.js web portal. Owns identity (NextAuth v5: email/password + Google/Facebook OAuth) and serves installer downloads for the desktop auto-updater.

**These two apps do not talk to each other today.** The backend has a real, working signup/login system; the desktop app has none — it has no login screen, no session, no concept of "who is using this." Anyone who launches the desktop app is in, fully authenticated to nothing. Closing this gap is the prerequisite for requirements #1, #2, #3, and #7 below, and should be sequenced first in the implementation plan that follows this PRD.

A prior design pass already exists for exactly this bridge — see `implementation_plan.md` at the repo root (email/password + OAuth login inside desktop Settings, deep-link handoff `doron-desktop://auth?token=...` for browser-based OAuth, and a backend `isPro` column driven by Stripe webhooks). That document should be treated as the starting draft for the auth/subscription implementation plan, not re-derived from scratch.

## 3. Users

- **Primary**: solo/small-firm lawyers and attorneys managing an active caseload, working mostly offline or on unreliable connections, often bilingual (Hebrew/English, RTL support already exists in the desktop UI).
- **Secondary** (not designed for yet): paralegals/support staff who might share access to a firm's cases — no multi-user/firm-account concept exists anywhere in the current data model (`cases`, etc. have no owner/tenant column). Worth flagging as an open question in §9.

## 4. Subscription model

Two tiers: **Free ($0)** and **Pro (paid)**. Chosen once at registration; presumably changeable later via the backend portal (billing/upgrade flow, not yet designed).

**Current state: does not exist.** No plan/tier/billing column anywhere in `apps/backend/database/schema.ts`, no Stripe or payment code anywhere in the repo. `implementation_plan.md` proposes the shape (`users.isPro: boolean`, Stripe webhook route flipping it) — a reasonable starting point.

On the desktop side, a **hardcoded, local-only feature-gating stub** was built this session (`apps/desktop/src/lib/featureGating.ts`) — per-feature × per-tier `enabled`/`disabled` config, with a `CURRENT_TIER` constant standing in for a real subscription, structured so it can later be backed by a real service (Statsig, or the backend's own `isPro` flag) without changing call sites. **It is not on `master`** — it lives on an unmerged branch/PR (#61) — and it enforces nothing server-side; a determined user can flip the local constant. It's infrastructure for later wiring, not a subscription system.

## 5. Features

Each feature below is graded against the actual code, not the vision. Legend: ✅ implemented · ⚠️ partial/gap · ❌ not started.

### 5.1 Registration by email — ❌ (desktop) / ✅ (backend only)

Backend `apps/backend/app/api/auth/signup/route.ts` is a real, working handler: validates input, checks for an existing email, bcrypt-hashes the password, inserts into `users` (`email` unique + not null, nullable `passwordHash` for OAuth-only accounts). This satisfies the requirement **for the web portal**. The desktop app has no registration surface at all — a new user opening the desktop app today cannot register or sign in from within it.

### 5.2 Login — username/password or Google — ❌ (desktop) / ✅ (backend only)

`apps/backend/auth.config.ts` + `auth.ts` configure a genuine NextAuth v5 setup: Google OAuth, Facebook OAuth, and a Credentials provider doing a real bcrypt compare. "Username" in the current schema is the email address — there is no separate username field; assumed synonymous unless told otherwise (see §9).

Desktop-side: zero. Closing this requires the deep-link OAuth handoff design already sketched in `implementation_plan.md` (§"Authentication Flow" — browser-based OAuth because Google blocks embedded-webview OAuth, custom `doron-desktop://` protocol to hand the session back to the Tauri app).

### 5.3 Plan selection at registration — ❌

Not implemented. No UI, no backend field, no billing integration. See §4.

### 5.4 Case management — ✅ substantial

`apps/desktop/src-tauri/src/case/mod.rs` (826 lines) has full CRUD: create/list/delete (soft-delete), status transitions, file attach/detach, per-case field values, annotations. Case-to-document linking is real (files live under the case's folder, tracked via `case_fields`). Case-to-email linking is real via the `case_emails` table and `email/emails_ops.rs`. This is the most mature feature in the product.

Gap: no multi-user/firm concept — see §9.

### 5.5 Document management (natural-language search) — ✅

Genuinely hybrid search, not keyword-only: `apps/desktop/src-tauri/src/query/queries.rs` runs FTS5 (`query_by_fts`) and a real vector search (`query_by_vector`, backed by fastembed's E5 embedding model in `embeddings/mod.rs`) in parallel, merges with a similarity-threshold gate, and applies a type-relevance boost. Cross-case document search (independent of any single case) works.

**Open risk, still live in the code**: `documents_fts` uses SQLite's default `unicode61` tokenizer (`store/mod.rs:455`), which does not stem Hebrew prefixes (ב/ל/ה/מ/ש/ו attached to nouns) — an exact-keyword FTS match can miss a document that a human would consider an obvious hit. This is meaningfully mitigated (not eliminated) by the vector-search track running in parallel, since embeddings are more prefix-tolerant than exact tokenization. Worth a dedicated eval run (the `eval` CLI already exists for exactly this) before calling Hebrew search "done."

Document-template creation "as the easy way to create cases" — see 5.6, since that's really the case-template flow.

### 5.6 Document templates & case templates — ⚠️ partial (creation-time only, not live-synced)

`doc_template/` handles single-document placeholder templates. `case_template` (`store/mod.rs:670-703`) groups multiple `doc_template`s under one set of shared field names via a `case_template_docs` join table.

**At case creation**, this works as described: `case/mod.rs::add_case` iterates the submitted field values and calls `doc_template::replace_docx_placeholders` across every linked template, so one set of inputs fills every document in the case template. This is the "much less work to create new cases" win described in the ask.

**The gap**: `save_case_fields` (`case/mod.rs:542-557`), used when a user edits a field *after* the case already exists, only writes to the `case_fields` table — it never re-invokes `replace_docx_placeholders` on the already-generated documents. So the literal claim "update one placeholder will reflect on all the others" is **true only at the moment of case creation**, not as an ongoing live sync. If live propagation on edit is actually required, that's new work, not a bug fix — worth confirming intent before scoping it into the plan (see §9).

### 5.7 AI support gated to Pro — ❌

No subscription-aware gating exists anywhere in the LLM layer (`llm/*.rs` — checked, zero hits for tier/plan/subscription). Every AI feature (local sidecar model, cloud providers, email classification, search reranking) is available regardless of plan today, because no plan concept exists in shipped code. The `featureGating.ts` stub from this session (§4) is a first building block but isn't wired into any AI call path yet, and isn't merged to `master`.

### 5.8 Document versioning — ✅

`apps/desktop/src-tauri/src/documents/versioning.rs`: full snapshot-based version history (copy-on-change, not diff-based) — `document_versions` table keyed by case/path, MD5-deduped, a folder-watcher that auto-backs-up on file-lock release (i.e. when Word closes the file) with a 3-hour cooldown, plus `restore_document_version`/`delete_document_version`. Solid, working feature.

### 5.9 Email support — ✅ mostly

`email/emails_ingestion.rs` (IMAP), `emails_ai.rs` (real cascade classification — embedding similarity first, LLM fallback second — to decide if an email belongs to a case), `emails_alerts.rs` (a `pending_email_alerts` table implies a review/confirm UX for uncertain matches, not silent auto-filing), `emails_ops.rs` (case-email listing, attachment listing/removal). Frontend `OpenCasesEmailsChat.tsx` renders ingested emails as a chat-bubble thread (incoming/outgoing bubbles, date dividers, attachment chips) — matching the "WhatsApp-style" ask. It's a passthrough viewer of real emails, not an AI chatbot, which matches what was actually requested. Attachment-to-case linking works (`case_emails.attachments_json`).

This is close to done; likely remaining work is refinement (classification accuracy, the AMI-31/AMI-32 language-detection and eval-harness items already tracked in Linear) rather than net-new architecture.

### 5.10 Access to Israeli "Mishpat Net" (נט המשפט) — ❌ nothing built

No code anywhere in the repo. This is genuinely new scope. Before committing engineering time: **נט המשפט gates most case data behind attorney-authenticated access and has terms of use governing automated access** — "scraping" needs a legal/ToS review (is this the lawyer's own authenticated session being automated on their behalf, or an attempt at public bulk scraping — those have very different risk profiles) before design work starts. Flagging this as a blocking research item, not a coding task, for whoever scopes the implementation plan.

### 5.11 Case simulation (AI-run mock trial) — future vision, out of scope now

User has explicitly deprioritized this ("advance feature not plan for now"). Recorded here so it isn't lost: a full simulated court session (defense, prosecution, witnesses, judge, run by AI) plus case-hole validation. No design work should start on this until 5.1–5.10 are further along; it also has the largest AI-cost and reliability surface of anything in this document.

## 6. Non-functional requirements

- **Local-first / privacy**: case data, documents, and (for local-mode AI) inference all stay on the lawyer's machine. This is a stated architectural value (see `gemini-local-mode-design.md`), not just a cost optimization — client confidentiality is presumably a real constraint for the target user. Any auth/subscription bridge to the backend must not silently start uploading case content.
- **Target hardware**: lawyer laptops are assumed 8–16GB RAM, average CPU, typically no dedicated GPU — constrains local AI model choice (already reflected in the existing local-model sidecar design).
- **Bilingual / RTL**: Hebrew and English, including RTL layout, is already a first-class concern (`context/LanguageContext.tsx`, `locales/`) — new features should not regress this.
- **Offline tolerance**: the desktop app currently works fully offline (local SQLite, optional local AI). Introducing auth/subscription enforcement must define what happens with no network — a lawyer standing in a courthouse basement with dead WiFi is a real scenario for this product, and if login is required to open the app at all that's a hard regression against current behavior.

## 7. Data model reality check

Everything lives in one local SQLite DB per install (`apps/desktop/src-tauri/src/store/mod.rs`): `cases`, `case_fields`, `case_annotations`, `document_annotations`, `tags` (generic system/user tag layer, already includes a `useremail` system tag intended as the future email→case matching key), `case_emails`, `pending_email_alerts`, `ignored_emails`, `documents`/`document_chunks` (FTS + vector), `doc_templates`, `case_templates`/`case_template_docs`, `document_versions`, `ai_configurations`, `email_configurations`, `user_settings`. None of it has an owner/user_id column — reinforcing that the backend's Postgres `users` table and the desktop's local data are two disconnected silos today.

## 8. Open questions / assumptions to confirm before planning

1. **"Username" in login (5.2)** — assumed to mean the email address (matches current backend schema, which has no separate username field). Confirm, or scope adding one.
2. **Live placeholder sync (5.6)** — is post-creation live re-propagation of field edits across all case documents actually required for v1, or is creation-time fill sufficient? Materially different amount of work.
3. **Multi-user / firm accounts** — nothing in scope today assumes more than one person per case. Is solo-practitioner-only acceptable for v1, or does "firm" sharing need to be designed in now (harder to retrofit later)?
4. **Mishpat Net scope (5.10)** — read-only case-status lookups for the lawyer's own cases? Full document retrieval? Which courts? This needs a legal/ToS answer before an engineering scope exists.
5. **Pro plan pricing/entitlements** — beyond "AI is Pro-only," which of 5.4–5.10 (if any) are also Pro-gated? The ask only specifies AI explicitly; case management, document search, versioning, email, and Mishpat Net are currently assumed free/universal unless stated otherwise.
6. **Offline + auth interaction** — does the app require an initial online login and then work offline indefinitely (license-check-once), or does it need periodic re-validation? Affects both UX and the "local-first" value prop.

## 9. Explicit non-goals for the next planning pass

- Case simulation (5.11) — vision only, not scoped.
- Multi-tenant/firm accounts — not scoped unless §8.3 says otherwise.
- Statsig (or any real flagging service) integration — the hardcoded gate infra is deliberately a placeholder; migrating to a real service is a separate, later effort.
