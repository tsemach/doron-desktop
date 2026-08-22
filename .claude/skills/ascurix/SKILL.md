---
name: ascurix
description: >-
  Guides the agent in setting up and managing multiple simultaneous local dev instances of this repo (one per git worktree) via the `ascurix` CLI (`pnpm ascurix local ...`), and its `eval`/`email` wrappers around the Rust evaluation CLI.
---

# Ascurix Local Dev CLI

## Overview
This skill covers `packages/ascurix`, a bash-only CLI (`pnpm ascurix ...`) built for ASC-178 ("Enable running multiple local instances"). Its `local` namespace lets several git worktrees of this repo run `pnpm dev` at the same time without port/database collisions, by giving each worktree its own loopback IP alias (`127.0.0.x`), its own Postgres container, and its own desktop `devUrl`. It also exposes `eval`/`email`, thin passthrough wrappers around the unrelated Rust `eval` CLI (see the `eval` skill) — ported from a developer's `~/.zsh_alias` so the logic lives in the repo instead of a machine-local dotfile.

Three top-level commands: `ascurix local <cmd>`, `ascurix eval <args>`, `ascurix email <args>`.

## Dependencies
- Docker + Docker Compose (each worktree's `local init` starts its own Postgres container).
- Must be run from inside a git worktree of this repo (`git rev-parse --show-toplevel` must succeed) — `local list`/`status` enumerate worktrees via `git worktree list --porcelain`.

## Quick Start
```bash
pnpm ascurix local init        # set up THIS worktree: IP, env files, postgres
pnpm ascurix local status      # show this worktree's assigned IP
pnpm ascurix local list        # show every worktree's assigned IP
pnpm ascurix local examples    # usage examples for every local command
pnpm dev                       # run as normal once init has completed
```

---

## Workflow

### 1. One-time prerequisite: the base Postgres bind
`apps/backend/docker-compose.yml`'s Postgres binds `127.0.0.1:5432:5432` (not `0.0.0.0:5432:5432`). This matters because **a wildcard (`0.0.0.0`) bind blocks every other bind on that port, on any address** — it's a kernel-level TCP constraint, not Docker-specific. If the *already-running* container was started before this change (or someone reverts the compose file), it'll still hold the wildcard, and `local init` in a second worktree will fail at the Postgres step with a Docker "port is already allocated" error — this is expected, not a bug in the tool. The fix is a one-time restart of the base container:
```bash
cd apps/backend && docker compose down && docker compose up -d
```
Verify with `docker ps --filter name=ascurix-postgres --format "{{.Ports}}"` — should show `127.0.0.1:5432->5432/tcp`, not `0.0.0.0:...`.

### 2. Setting up a new worktree
From inside the worktree:
```bash
pnpm install        # links the ascurix bin into this worktree's node_modules/.bin
pnpm ascurix local init
```
This allocates a deterministic IP (`127.0.0.<2 + hash(abs worktree path) % 253>` — same worktree path always gets the same IP, no persisted registry; collisions against sibling worktrees are resolved by scanning `git worktree list` and reading their `apps/desktop/.env.local`), then:
- upserts (never truncates) `HOST`/`PORT`/`DATABASE_URL`/`ALLOWED_DESKTOP_ORIGIN` into `apps/backend/.env.local`
- upserts `HOST`/`PORT`/`OFFICE_DATABASE_URL`/`BACKEND_DATABASE_URL`/`BACKEND_APP_URL` into `apps/office/.env.local`
- upserts `TAURI_DEV_HOST`/`VITE_BACKEND_URL` into `apps/desktop/.env.local`
- generates (gitignored) `apps/desktop/src-tauri/tauri.conf.local.json` with the worktree's `devUrl`
- generates (gitignored) `apps/backend/docker-compose.override.yml` with a `container_name` and `ports: !override` bind to this worktree's IP — the `!override` Compose merge tag is required, since Compose concatenates `ports` lists by default rather than replacing them
- starts that container

After `init`, `pnpm dev` (unmodified) picks everything up automatically.

### 3. Custom / non-loopback IPs
`pnpm ascurix local init --ip <address>` pins a specific IP instead of the deterministic default. If it's outside `127.0.0.0/8`, `ascurix` prints (but does not run) the OS command to alias it onto loopback, e.g. `sudo ip addr add 10.10.10.5/32 dev lo` on Linux — it will not do this for you, and won't be reachable until you do.

### 4. Tearing down
```bash
pnpm ascurix local rm
```
Stops the worktree's Postgres container and deletes the CLI-owned generated files (`tauri.conf.local.json`, `docker-compose.override.yml`). It deliberately leaves `.env.local` files alone — they're managed via upsert and may hold hand-added values (API keys, tokens) unrelated to ascurix.

### 5. `eval` / `email` (unrelated feature, same CLI)
```bash
pnpm ascurix eval run --provider mock --algorithm hybrid --corpus-dir ./my_test_docs
pnpm ascurix email generate ...
```
Both require `apps/desktop/src-tauri/Cargo.toml` to exist under the current worktree root and forward straight to `cargo run --bin eval --manifest-path <root>/apps/desktop/src-tauri/Cargo.toml -- document ...` / `-- email ...`. For the underlying subcommands (`run`, `generate`, `list`, `compare`, `show`, ...), see the `eval` skill.

---

## Common Mistakes & Pitfalls

* **Assuming a second worktree's `local init` failure at the Postgres step is a tool bug.** It almost always means the base `ascurix-postgres` container is still wildcard-bound and needs the one-time restart in §1. Check `docker ps` before debugging further.
* **Using `--ip` outside `127.0.0.0/8` without aliasing it first.** `ascurix` will not run `sudo ip addr add` for you — it only prints the command.
* **Expecting `ascurix local rm` to delete `.env.local`.** It won't, by design — those files may contain hand-added secrets (e.g. `VERCEL_OIDC_TOKEN`, `AUTH_SECRET`, `RESEND_API_KEY` have all been observed in these files in this repo). Only CLI-fully-owned files are removed.
* **Running `ascurix` outside a worktree of this repo.** Every command starts with `require_git_worktree`, which calls `git rev-parse --show-toplevel` — fails fast with a clear error otherwise.
* **Editing `apps/desktop/src-tauri/tauri.conf.local.json` or `apps/backend/docker-compose.override.yml` by hand and expecting it to persist.** Both are gitignored and fully regenerated (overwritten) on every `local init`.
* **Forgetting `pnpm install` in a freshly created worktree before `pnpm ascurix ...`.** The `ascurix` bin is a workspace package (`packages/ascurix`, root `devDependency`); each worktree has its own `node_modules` and needs its own install.
