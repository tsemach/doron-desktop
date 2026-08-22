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

stop_postgres() {
  local root="$1"
  if [ ! -f "$root/apps/backend/docker-compose.override.yml" ]; then
    return 0
  fi
  (cd "$root/apps/backend" && docker compose down)
}
