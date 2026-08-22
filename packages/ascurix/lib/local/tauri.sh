# Generates the gitignored Tauri config override that points the desktop
# webview's devUrl at this worktree's IP, and marks the window title with
# this worktree's branch so it's obvious which instance you're looking at
# when several are running at once. apps/desktop/scripts/start-dev.sh
# passes this file via `tauri dev -c` when it exists, and falls back to
# the checked-in tauri.conf.json (title "Ascurix", no branch suffix)
# otherwise -- `tauri build`/`desktop:release` never reference this file,
# so production is unaffected regardless.

write_tauri_override() {
  local root="$1" ip="$2" branch="$3" file
  file="$root/apps/desktop/src-tauri/tauri.conf.local.json"
  # Tauri merges config layers via JSON Merge Patch (RFC 7396), which
  # replaces array values wholesale rather than merging elements -- so
  # `windows` here must repeat every field from the base tauri.conf.json's
  # window entry, not just `title`, or the override would silently drop
  # width/height/visible/additionalBrowserArgs.
  cat >"$file" <<EOF
{
  "\$schema": "https://schema.tauri.app/config/2",
  "build": {
    "devUrl": "http://${ip}:1420"
  },
  "app": {
    "windows": [
      {
        "title": "Ascurix (${branch})",
        "width": 1000,
        "height": 800,
        "visible": false,
        "additionalBrowserArgs": "--disable-gpu"
      }
    ]
  }
}
EOF
}
