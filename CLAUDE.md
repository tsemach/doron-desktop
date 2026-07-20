# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Amicus (the repo, directory, app identifier, and build artifacts still use the pre-rename name `doron-desktop` — see `.claude/rules/project-naming.md`) is a legal/case management platform, structured as a `pnpm` + Turborepo monorepo with two apps:

- **`apps/desktop/`** — Tauri v2 desktop client: React + TypeScript frontend (Vite, Tailwind v4, shadcn/ui) with a Rust backend. This is where almost all product logic lives (document indexing/search, case management, templates, email ingestion, local/cloud LLM providers).
- **`apps/backend/`** — Next.js 15 web portal: auth (NextAuth v5 + Drizzle/Postgres), user login/signup, and installer download redirects for the desktop app's auto-updater.
- **`packages/ui/`** — Shared UI components/config consumed by the workspaces (`@workspace/ui`).

The desktop app's frontend is bundled by Vite and served from `apps/desktop/dist` in production. The Rust side exposes commands via `#[tauri::command]` that the frontend calls with `invoke()` from `@tauri-apps/api/core`.

Product vision and feature scope live in `PRD.md`; the phased implementation roadmap (including what's already built vs. planned) lives in `PLAN.md` — both at the repo root. Consult those before assuming a feature is in scope or already implemented.

## Commands

Run from the **repo root** unless noted:

```bash
# Full dev stack (desktop + backend in parallel, via turbo)
pnpm dev

# Desktop only: Vite on :1420, then launches the Tauri window
pnpm desktop:dev

# Backend only: Next.js dev server on :3000
pnpm backend:dev

# Build everything / lint everything
pnpm build
pnpm lint

# Desktop production build (Windows NSIS installer)
pnpm desktop:release
```

Inside `apps/desktop/`:
```bash
pnpm build              # tsc + vite build → dist/
npx tsc --noEmit         # type-check without emitting
pnpm dlx shadcn add <component-name>
```

Inside `apps/desktop/src-tauri/` (Rust):
```bash
cargo check              # fast compile check
cargo build
cargo test                                     # run all tests (see tests/ below)
cargo test --test extractor_test <name>        # run a single test binary/test
```

Vite's dev server is fixed to port **1420** (`strictPort: true`) for desktop and Next.js defaults to **3000** for backend — free the port before retrying if either fails to start.

### Evaluation CLI (`eval`)

A standalone Rust binary (`apps/desktop/src-tauri/src/bin/eval/`) benchmarks document search (FTS / vector / hybrid) against a labeled corpus. See `.agents/skills/eval/SKILL.md` for full usage; quick reference:

```bash
# Generate a synthetic test corpus + ground-truth queries
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document generate --corpus-dir ./my_test_docs

# Index the corpus and score an algorithm against evaluation_dataset.json
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document run --provider mock --algorithm hybrid --corpus-dir ./my_test_docs

# Inspect history
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document list
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document show <run_id>
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml document compare <run_a> <run_b>
```

Two separate SQLite DBs are involved: `evaluation_history.db` (run metadata/metrics — use for `list`/`show`/`compare`) and `evaluation_index.db` (scratch search index for a run). Don't point `show`/`list` at the index DB.

## Architecture

### Desktop frontend (`apps/desktop/src/`)
- **`main.tsx`** — React entry point; mounts `<App />`
- **`App.tsx`** — Root component; calls Rust commands via `invoke()`
- **`components/`** — Feature areas: `CaseManagement/`, `DocsManagement/`, `Settings/`, `Updater/`, plus `ui/` (shadcn primitives)
- **`store/aiStore.ts`** — Jotai store for AI/LLM provider settings
- **`context/LanguageContext.tsx`** + **`locales/`** — i18n (English/Hebrew; app supports RTL Hebrew content)
- **`lib/utils.ts`** — `cn()` helper (clsx + tailwind-merge); aliased as `@/lib/utils`
- **`styles/globals.css`** — Tailwind v4 + shadcn/ui CSS variable theme (light/dark tokens in `oklch`)
- Routing uses `MemoryRouter` (not `BrowserRouter`) — Tauri's webview has no real URL bar, so history-based routing silently fails.

### Desktop Rust backend (`apps/desktop/src-tauri/src/`)
- **`lib.rs`** — App builder and command registration; all `#[tauri::command]`s are wired into `tauri::generate_handler![]` inside `run()`. Also spawns the local LLM sidecar (`llama-server`) on startup when configured.
- **`main.rs`** — Thin entry point; calls `lib::run()`
- **`store/`** — SQLite schema/connection management (`get_db_path`, migrations)
- **`extractor/`** — Text extraction per file type: `docx.rs`, `pdf.rs`, `xlsx.rs`, `txt.rs`
- **`indexer/`** — Orchestrates extraction → LLM metadata → embeddings → DB write for a folder/file
- **`embeddings/`** — Local vector embedding generation (fastembed/E5)
- **`query/`** — Search: `queries.rs` (FTS/vector/hybrid SQL), `llm.rs` (LLM-assisted query rewriting), `helpers.rs`, `types.rs`
- **`llm/`** — Provider abstraction: `llm_provider.rs` (trait) with `llm_provider_{entropic,gemini,openai,mock}.rs` implementations, `llm_local_mode.rs` (manages the bundled `llama-server` sidecar for local GGUF models), `llm_settings.rs`
- **`doc_template/`** and **`case_template/`** — Document/case template CRUD, placeholder filling, field-context extraction
- **`case/`** — Case CRUD and annotations
- **`email/`** — IMAP ingestion (`emails_ingestion.rs`), AI-assisted email classification (`emails_ai.rs`), alerts, settings, and shared `types.rs`
- **`documents/`** — Document versioning (`versioning.rs`)
- **`clipboard.rs`**, **`power.rs`** — small OS-integration commands
- **`bin/eval/`** — the standalone `eval` CLI described above; not part of the main app binary

Tests live in `apps/desktop/src-tauri/tests/` as separate integration test crates (`extractor/`, `embeddings/`, `indexer/`, each with their own `main.rs`), plus top-level `provider_test.rs`, `downloader_test.rs`, `decoupled_pipeline_test.rs`. `tests/test_corpus/` holds sample Hebrew/English legal documents used by extractor/eval tests.

### Desktop Tauri configuration
- **`src-tauri/tauri.conf.json`** — App identity (`com.tsemach.doron-desktop`), window size, updater config (GitHub Releases endpoint), NSIS bundle target, `externalBin` for the `llama-server` sidecar
- **`src-tauri/capabilities/default.json`** — Window/plugin permissions (dialog, updater, opener with scoped path allowlists); add new plugin permissions here

### Adding a Tauri command
1. Define the function in the relevant `src-tauri/src/<module>/mod.rs` with `#[tauri::command]`
2. Register it in `tauri::generate_handler![...]` inside `lib.rs::run()`
3. Call it from React: `await invoke("your_fn", { arg1, arg2 })`
4. Commands needing app state or the window handle should accept `tauri::AppHandle` or `tauri::Window` as the first argument.

### Backend (`apps/backend/`)
Next.js 15 App Router app (`app/`) for the web portal:
- **`auth.ts` / `auth.config.ts`** — NextAuth v5 setup (Google/Facebook OAuth + credentials)
- **`database/schema.ts`, `database/index.ts`** — Drizzle ORM schema and DB client (Postgres, local via `docker-compose.yml` or Neon)
- **`app/api/auth/`** — NextAuth route handler + signup
- **`app/api/download/`** — Serves/redirects desktop installer assets for the auto-updater
- **`middleware.ts`** — Route protection
- `pnpm --filter backend db:generate` / `db:push` (Drizzle) manage schema migrations

### Releases & auto-update
Desktop releases are built and signed via GitHub Actions: bump `version` in `apps/desktop/src-tauri/tauri.conf.json`, push, then tag `vX.Y.Z` — CI builds the signed Windows NSIS installer and `latest.json`, uploaded as a draft GitHub Release that the updater plugin polls.

## Styling

Tailwind v4 is integrated via the `@tailwindcss/vite` plugin (no `tailwind.config.*` file). Theme tokens are CSS variables in `apps/desktop/src/styles/globals.css`; `@theme inline` maps them to Tailwind utility names. shadcn/ui components use the `radix-nova` style, aliased to `@/components/ui` (see `apps/desktop/components.json`).
