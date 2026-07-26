#!/bin/bash
set -e

# Deletes one or more users (by email) from the backend Postgres database --
# for local/dev testing, so you can re-register the same email. Reads
# DATABASE_URL from apps/backend/.env.
#
# Usage:
#   scripts/delete-user.sh user@example.com [user2@example.com ...]
#   scripts/delete-user.sh -y user@example.com   # skip the confirmation prompt

SKIP_CONFIRM=false
if [ "$1" = "-y" ] || [ "$1" = "--yes" ]; then
    SKIP_CONFIRM=true
    shift
fi

if [ $# -eq 0 ]; then
    echo "Usage: $0 [-y] <email> [email2 ...]"
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/apps/backend"
ENV_FILE="$BACKEND_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found."
    exit 1
fi

DATABASE_URL=$(grep -E "^DATABASE_URL=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set in $ENV_FILE."
    exit 1
fi

if [ "$SKIP_CONFIRM" != true ]; then
    echo "About to permanently delete the following user(s) from the database:"
    for email in "$@"; do
        echo "  - $email"
    done
    read -r -p "Continue? [y/N] " REPLY
    if [ "$REPLY" != "y" ] && [ "$REPLY" != "Y" ]; then
        echo "Aborted."
        exit 1
    fi
fi

cd "$BACKEND_DIR"
# NODE_PATH so delete-user.js (which lives in scripts/, not apps/backend/)
# can still resolve the "pg" package installed here.
DATABASE_URL="$DATABASE_URL" NODE_PATH="$BACKEND_DIR/node_modules" node "$ROOT_DIR/scripts/delete-user.js" "$@"
