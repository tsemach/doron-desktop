#!/usr/bin/env bash
set -eu -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

HOST="${HOST:-${HOSTNAME:-127.0.0.1}}"
PORT="${PORT:-3001}"

exec next dev --port "$PORT" -H "$HOST"
