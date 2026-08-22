# Generates a gitignored docker-compose override that gives this worktree
# its own Compose *project* (not just its own container name) -- Compose
# otherwise defaults the project name to the current directory's basename
# ("backend"), which every worktree shares, so without an explicit unique
# `name:` here two worktrees' `docker compose` invocations resolve to the
# SAME project and silently share containers/volumes/networks instead of
# being isolated. Hit for real once during development.
#
# The override must ALSO explicitly rename the `postgres_data` volume
# (`volumes.postgres_data.name` below). The base docker-compose.yml pins
# that volume to a fixed name (`backend_postgres_data`) so restarting the
# base instance under a renamed project doesn't fork onto a new empty
# volume -- but a plain top-level-key merge means every worktree override
# inherits that SAME pinned name unless it overrides it too. Also hit for
# real once: a worktree's Postgres ended up mounting the exact same data
# directory as the main instance while both were running, and Postgres's
# own lock-file self-protection force-shut the main instance down when it
# noticed. `name:` on a mapping value like this merges per-key (unlike
# `ports`, a list, which needs `!override`), so this alone is enough.

write_compose_override() {
  local root="$1" ip="$2" label="$3" file
  file="$root/apps/backend/docker-compose.override.yml"
  # `ports` must use the !override merge tag -- Compose concatenates list
  # fields by default, so without it this would ADD a 127.0.0.x binding
  # alongside the base file's 127.0.0.1:5432 one instead of replacing it,
  # leaving the port collision this override exists to avoid.
  cat >"$file" <<EOF
name: ascurix-backend-${label}
services:
  postgres:
    container_name: postgres-${label}
    ports: !override
      - "${ip}:5432:5432"
volumes:
  postgres_data:
    name: ascurix-backend-${label}_postgres_data
EOF
}

start_postgres() {
  local root="$1"
  (cd "$root/apps/backend" && docker compose up -d)
}

# wait_for_postgres <container_name> -- `docker compose up -d` returns as
# soon as the container starts, not once Postgres is actually accepting
# connections (there's a real, observed few-second gap). Callers that need
# to run something against the database right after starting it (db:push)
# must wait for this first or race a connection-refused failure.
wait_for_postgres() {
  local container="$1" tries=0
  while [ "$tries" -lt 30 ]; do
    if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    tries=$((tries + 1))
  done
  echo "ascurix: postgres container '$container' did not become ready within 30s" >&2
  return 1
}

# ensure_database <container_name> <dbname> -- a fresh worktree Postgres
# instance only has the image's default POSTGRES_DB (doron_db); the
# ascurix-backend/ascurix-office databases drizzle-kit push targets don't
# exist yet and it won't create them itself (it only creates tables within
# an existing database). Postgres has no `CREATE DATABASE IF NOT EXISTS`,
# so check first.
ensure_database() {
  local container="$1" dbname="$2"
  if ! docker exec "$container" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${dbname}'" | grep -q 1; then
    docker exec "$container" psql -U postgres -c "CREATE DATABASE \"${dbname}\""
  fi
}

stop_postgres() {
  local root="$1"
  if [ ! -f "$root/apps/backend/docker-compose.override.yml" ]; then
    return 0
  fi
  (cd "$root/apps/backend" && docker compose down)
}
