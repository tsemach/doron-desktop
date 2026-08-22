#!/usr/bin/env bash
# Runs `tauri dev`, pointed at this worktree's devUrl override if
# `pnpm ascurix init` (see packages/ascurix, ASC-178) has generated one.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f src-tauri/tauri.conf.local.json ]; then
  exec tauri dev -c src-tauri/tauri.conf.local.json
else
  exec tauri dev
fi
