# Generates the gitignored Tauri config override that points the desktop
# webview's devUrl at this worktree's IP, marks the window title with this
# worktree's branch so it's obvious which instance you're looking at when
# several are running at once, and gives the worktree its own app
# `identifier` so concurrent instances don't share an OS app-data dir (and
# therefore don't share the local SQLite auth_session/doc-index DB --
# without this, two worktrees running together kick each other back to
# the login screen because logging into one overwrites the other's session
# row in that shared DB). apps/desktop/scripts/start-dev.sh passes this
# file via `tauri dev -c` when it exists, and falls back to the checked-in
# tauri.conf.json (title "Ascurix", base identifier, no branch suffix)
# otherwise -- `tauri build`/`desktop:release` never reference this file,
# so production is unaffected regardless.

# Must match the checked-in apps/desktop/src-tauri/tauri.conf.json's
# top-level "identifier" -- kept as one constant so write_tauri_override
# and seed_app_data_dir can't drift apart.
BASE_APP_IDENTIFIER="com.tsemach.doron-desktop"

write_tauri_override() {
  local root="$1" ip="$2" branch="$3" label="$4" file
  file="$root/apps/desktop/src-tauri/tauri.conf.local.json"
  # Tauri merges config layers via JSON Merge Patch (RFC 7396), which
  # replaces array values wholesale rather than merging elements -- so
  # `windows` here must repeat every field from the base tauri.conf.json's
  # window entry, not just `title`, or the override would silently drop
  # width/height/visible/additionalBrowserArgs.
  cat >"$file" <<EOF
{
  "\$schema": "https://schema.tauri.app/config/2",
  "identifier": "${BASE_APP_IDENTIFIER}.${label}",
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

# Seeds a fresh worktree's own Tauri app-data dir (SQLite doc index/auth
# session, webview cookies/localStorage/cache -- see store::db_path) by
# copying the base, un-scoped identifier's dir wholesale, so a new
# worktree doesn't start with an empty document index. Only seeds once --
# skipped entirely if this worktree's own app-data dir already exists, so
# repeat `local init` runs never clobber data the worktree has since
# indexed or logged into (matching the upsert-not-truncate behavior of the
# .env.local writers elsewhere in this script).
#
# Linux-only (XDG_DATA_HOME / ~/.local/share) -- this tooling is currently
# only exercised under WSL/Linux; macOS (~/Library/Application Support)
# and native Windows (%APPDATA%) resolve app_data_dir differently and
# aren't handled here, so this is a silent no-op on those platforms.
#
# Copies with `cp -rL` (dereferencing symlinks), not a SQLite-safe backup
# -- if the base identifier's app is running (and writing WAL pages) at
# the moment of the copy, the seeded documents.db can come out torn. Close
# it first for a clean seed. `-L` matters specifically because on at least
# one dev machine documents.db is itself a symlink out to the Windows
# filesystem (WSL) -- a plain `cp -r` would copy that symlink verbatim,
# leaving every worktree still pointed at the one shared physical file
# and defeating the whole point of this function.
seed_app_data_dir() {
  local label="$1" data_home base_dir target_dir
  data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
  base_dir="${data_home}/${BASE_APP_IDENTIFIER}"
  target_dir="${data_home}/${BASE_APP_IDENTIFIER}.${label}"

  [ -d "$base_dir" ] || return 0
  [ -d "$target_dir" ] && return 0

  cp -rL "$base_dir" "$target_dir"
  echo "ascurix: seeded app data for '${label}' from ${BASE_APP_IDENTIFIER}"
}
