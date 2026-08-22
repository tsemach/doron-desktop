# Generates the gitignored Tauri config override that points the desktop
# webview's devUrl at this worktree's IP. apps/desktop/package.json's
# start:dev passes this file via `tauri dev -c` when it exists, and falls
# back to the checked-in tauri.conf.json otherwise.

write_tauri_override() {
  local root="$1" ip="$2" file
  file="$root/apps/desktop/src-tauri/tauri.conf.local.json"
  cat >"$file" <<EOF
{
  "\$schema": "https://schema.tauri.app/config/2",
  "build": {
    "devUrl": "http://${ip}:1420"
  }
}
EOF
}
