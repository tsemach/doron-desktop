# Generates the per-app .env.local files for a given worktree + IP.
# These only ever add/update specific keys (via set_env_var) -- they never
# truncate a file, since apps/office/.env.local in particular may already
# contain hand-managed values.

write_backend_env() {
  local root="$1" ip="$2" file
  file="$root/apps/backend/.env.local"
  set_env_var "$file" "HOST" "$ip"
  set_env_var "$file" "PORT" "3000"
  set_env_var "$file" "DATABASE_URL" "postgresql://postgres:postgres@${ip}:5432/ascurix-backend?schema=public"
  set_env_var "$file" "ALLOWED_DESKTOP_ORIGIN" "http://${ip}:1420"
}

write_office_env() {
  local root="$1" ip="$2" file
  file="$root/apps/office/.env.local"
  set_env_var "$file" "HOST" "$ip"
  set_env_var "$file" "PORT" "3001"
  set_env_var "$file" "OFFICE_DATABASE_URL" "postgresql://postgres:postgres@${ip}:5432/ascurix-office?schema=public"
  set_env_var "$file" "BACKEND_DATABASE_URL" "postgresql://postgres:postgres@${ip}:5432/ascurix-backend?schema=public"
  set_env_var "$file" "BACKEND_APP_URL" "http://${ip}:3000"
}

write_desktop_env() {
  local root="$1" ip="$2" file
  file="$root/apps/desktop/.env.local"
  set_env_var "$file" "TAURI_DEV_HOST" "$ip"
  set_env_var "$file" "VITE_BACKEND_URL" "http://${ip}:3000"
}
