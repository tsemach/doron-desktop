# Generates a gitignored docker-compose override that binds this
# worktree's Postgres container to its own loopback IP and gives it a
# unique container name (Compose auto-merges docker-compose.override.yml
# alongside docker-compose.yml, so the tracked file stays untouched).

write_compose_override() {
  local root="$1" ip="$2" label="$3" file
  file="$root/apps/backend/docker-compose.override.yml"
  # `ports` must use the !override merge tag -- Compose concatenates list
  # fields by default, so without it this would ADD a 127.0.0.x binding
  # alongside the base file's 0.0.0.0:5432 one instead of replacing it,
  # leaving the port collision this override exists to avoid.
  cat >"$file" <<EOF
services:
  postgres:
    container_name: postgres-${label}
    ports: !override
      - "${ip}:5432:5432"
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
