# Subcommand implementations for bin/ascurix.

cmd_init() {
  require_git_worktree
  local explicit_ip=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --ip)
        explicit_ip="$2"
        shift 2
        ;;
      *)
        echo "ascurix init: unknown option '$1'" >&2
        exit 1
        ;;
    esac
  done

  local root ip label branch
  root="$(worktree_root)"
  ip="$(allocate_ip "$explicit_ip")"
  label="$(worktree_label)"
  branch="$(worktree_branch)"

  warn_if_non_loopback "$ip"

  write_backend_env "$root" "$ip"
  write_office_env "$root" "$ip"
  write_desktop_env "$root" "$ip"
  write_tauri_override "$root" "$ip" "$branch" "$label"
  seed_app_data_dir "$label"
  write_compose_override "$root" "$ip" "$label"
  start_postgres "$root"
  wait_for_postgres "postgres-${label}"
  ensure_database "postgres-${label}" "ascurix-backend"
  ensure_database "postgres-${label}" "ascurix-office"
  push_schemas "$root"
  seed_multienv_user "$root"

  cat <<EOF
ascurix: worktree '$label' ready on $ip
  backend  -> http://${ip}:3000
  office   -> http://${ip}:3001
  desktop  -> http://${ip}:1420 (window title: "Ascurix (${branch})")
  postgres -> ${ip}:5432 (container postgres-${label}, schema pushed, no data copied)
  login    -> ${MULTIENV_SEED_EMAIL} / ${MULTIENV_SEED_PASSWORD} (role: ${MULTIENV_SEED_ROLE})

Run 'pnpm dev' from $root to start everything.
EOF
}

# Runs drizzle-kit push for both apps against THIS worktree's fresh,
# empty database -- no data is copied from any other instance, just
# schema. drizzle-kit only auto-loads a plain `.env` file, never
# `.env.local` (checked its bundled dotenv logic directly), so passing
# DATABASE_URL/OFFICE_DATABASE_URL explicitly here is required, not
# redundant -- without it this would silently push against whatever
# `.env` resolves to instead of this worktree's isolated database.
push_schemas() {
  local root="$1" backend_db_url office_db_url
  backend_db_url="$(env_var_value "$root/apps/backend/.env.local" "DATABASE_URL")"
  office_db_url="$(env_var_value "$root/apps/office/.env.local" "OFFICE_DATABASE_URL")"
  (cd "$root" && DATABASE_URL="$backend_db_url" pnpm --filter backend db:push)
  (cd "$root" && OFFICE_DATABASE_URL="$office_db_url" pnpm --filter office db:push)
}

MULTIENV_SEED_EMAIL="user@multi.env"
MULTIENV_SEED_PASSWORD="123456"
MULTIENV_SEED_ROLE="manager"

# A freshly created worktree's database has schema but zero rows (push_schemas
# above only pushes schema, never copies data) -- there is no user to log in
# with until one is created by hand. Seeds exactly one manager-role login per
# worktree so a new multi-env instance is immediately usable, reusing
# apps/backend/scripts/seed-admin.mjs's existing idempotent-by-email insert
# logic (parameterized via SEED_* env vars) rather than duplicating it.
seed_multienv_user() {
  local root="$1" backend_db_url
  backend_db_url="$(env_var_value "$root/apps/backend/.env.local" "DATABASE_URL")"
  (
    cd "$root" && DATABASE_URL="$backend_db_url" \
      SEED_EMAIL="$MULTIENV_SEED_EMAIL" SEED_PASSWORD="$MULTIENV_SEED_PASSWORD" \
      SEED_NAME="Multi-Env User" SEED_ROLE="$MULTIENV_SEED_ROLE" \
      pnpm --filter backend db:seed
  )
}

cmd_status() {
  require_git_worktree
  local root ip
  root="$(worktree_root)"
  ip="$(worktree_assigned_ip "$root" 2>/dev/null || true)"
  if [ -z "$ip" ]; then
    echo "ascurix: no instance configured for this worktree yet -- run 'pnpm ascurix init'"
    return 1
  fi
  echo "$root -> $ip"
}

cmd_list() {
  require_git_worktree
  git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
    ip="$(worktree_assigned_ip "$wt" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      printf '%s -> %s\n' "$wt" "$ip"
    else
      printf '%s -> (not configured)\n' "$wt"
    fi
  done
}

cmd_rm() {
  require_git_worktree
  local root
  root="$(worktree_root)"
  stop_postgres "$root"
  # Only remove files ascurix fully owns. .env.local files are managed via
  # set_env_var (upsert-only) and may contain hand-added values, so they're
  # deliberately left alone here.
  rm -f \
    "$root/apps/desktop/src-tauri/tauri.conf.local.json" \
    "$root/apps/backend/docker-compose.override.yml"
  echo "ascurix: removed local instance config for $root"
}

cmd_examples() {
  cat <<'EOF'
ascurix local init
    Set up this worktree: allocate a loopback IP, write backend/office/
    desktop .env.local, generate the desktop devUrl + postgres overrides
    (the desktop window is also titled "Ascurix (<branch>)" instead of
    plain "Ascurix", so you can tell instances apart), start this
    worktree's postgres container, wait for it to accept connections,
    and push the backend/office schema to it -- a fresh, empty database,
    not a copy of any other instance's data.

ascurix local init --ip 127.0.0.42
    Same, but pin a specific IP instead of the deterministic default
    (useful if two worktrees happen to hash-collide, or to keep a stable
    address across a worktree you recreate often).

ascurix local init --ip 10.10.10.5
    Same, with an address outside 127.0.0.0/8 (e.g. to reach the instance
    from another device on the LAN). You must alias it onto the loopback
    interface yourself first -- ascurix will print the exact command
    (e.g. `sudo ip addr add 10.10.10.5/32 dev lo` on Linux) and refuse to
    run it for you.

ascurix local status
    Show the IP this worktree is currently assigned (or a hint to run
    'init' if it isn't configured yet).

ascurix local list
    Show every worktree of this repo and its assigned IP, so you can see
    at a glance which worktrees are set up for simultaneous 'pnpm dev'.

ascurix local rm
    Stop this worktree's postgres container and delete the CLI-owned
    generated files (tauri.conf.local.json, docker-compose.override.yml).
    .env.local files are left untouched since they may hold hand-added
    values.
EOF
}
