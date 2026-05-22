# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Tauri v2 desktop application combining a React + TypeScript frontend with a Rust backend. The frontend is bundled by Vite and served from `../dist` in production. The Rust side exposes commands via `#[tauri::command]` that the frontend calls with `invoke()` from `@tauri-apps/api/core`.

## Commands

```bash
# Run the full Tauri dev environment (starts Vite on :1420, then launches the Tauri window)
pnpm tauri dev

# Build the frontend only
pnpm build         # tsc + vite build → dist/

# Build the full Tauri app for distribution
pnpm tauri build

# Type-check without emitting
npx tsc --noEmit

# Add a shadcn/ui component
pnpm dlx shadcn add <component-name>

# Compile Rust only (faster feedback than full tauri build)
cd src-tauri && cargo build
cd src-tauri && cargo check
```

Vite's dev server is fixed to port **1420** (`strictPort: true`). If that port is busy the dev command will fail — free it before retrying.

## Architecture

### Frontend (`src/`)
- **`src/main.tsx`** — React entry point; mounts `<App />` into `#root`
- **`src/App.tsx`** — Root component; calls Rust commands via `invoke()`
- **`src/styles/globals.css`** — Tailwind v4 + shadcn/ui CSS variable theme (light/dark tokens in `oklch`)

### Shared utilities (`lib/`)
- **`src/lib/utils.ts`** — `cn()` helper (clsx + tailwind-merge); aliased as `@/lib/utils` in tsconfig paths

### Rust backend (`src-tauri/src/`)
- **`lib.rs`** — All Tauri commands live here; register new commands in the `invoke_handler![]` macro inside `run()`
- **`main.rs`** — Thin entry point; calls `lib::run()`

### Tauri configuration
- **`src-tauri/tauri.conf.json`** — App identity (`com.tsemach.tauri-app`), window size (1000×800), CSP disabled, bundle targets
- **`src-tauri/capabilities/default.json`** — Window permissions (`core:default`, `opener:default`); add new plugin permissions here

## Styling

Tailwind v4 is integrated via the `@tailwindcss/vite` plugin (no `tailwind.config.*` file). Theme tokens are CSS variables defined in `src/styles/globals.css`; `@theme inline` maps them to Tailwind utility names.

shadcn/ui components use the `radix-nova` style and are aliased to `@/components/ui`. The `components.json` config drives the `shadcn add` CLI.

## Adding Tauri Commands

1. Define the function in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Register it in `tauri::generate_handler![your_fn]` inside `run()`
3. Call it from React: `await invoke("your_fn", { arg1, arg2 })`

Commands that need access to app state or the window handle should accept `tauri::AppHandle` or `tauri::Window` as the first argument.

## Routing

Use `MemoryRouter` (not `BrowserRouter`) — Tauri's webview has no real URL bar, so history-based routing silently fails.
