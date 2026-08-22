# Shared helpers for the ascurix CLI. Sourced by bin/ascurix, not executed
# directly.

require_git_worktree() {
  if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "ascurix: must be run from inside a git worktree of this repo." >&2
    exit 1
  fi
}

worktree_root() {
  git rev-parse --show-toplevel
}

# Sanitizes the worktree directory name into a docker/hostname-safe label,
# e.g. "asc-178-enable-running-multiple-local-instances".
worktree_label() {
  basename "$(worktree_root)" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-\+/-/g; s/^-//; s/-$//'
}

# Current branch of this worktree, e.g.
# "tsemachmizrachi/asc-178-enable-running-multiple-local-instances". Falls
# back to the worktree label if HEAD is detached (no current branch).
worktree_branch() {
  local branch
  branch="$(git -C "$(worktree_root)" branch --show-current)"
  if [ -z "$branch" ]; then
    worktree_label
  else
    echo "$branch"
  fi
}

# set_env_var <file> <key> <value> -- create/update a KEY=value line in an
# env file, preserving every other line. Never truncates or clobbers
# unrelated content a developer may have added by hand.
set_env_var() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

# env_var_value <file> <key> -- read back a value set by set_env_var, so
# callers don't have to reconstruct a URL/value a second time.
env_var_value() {
  local file="$1" key="$2"
  grep "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2-
}

# run_eval_binary <top-level-subcommand> [args...] -- shared by `ascurix
# eval` (document evaluation) and `ascurix email` (email evaluation), both
# thin wrappers around the same Rust CLI
# (apps/desktop/src-tauri/src/bin/eval), ported from the ~/.zsh_alias
# `ascurix` function so it lives in the repo instead of a machine-local
# dotfile.
EVAL_MANIFEST="apps/desktop/src-tauri/Cargo.toml"

run_eval_binary() {
  local root
  root="$(worktree_root)"
  if [ ! -f "$root/$EVAL_MANIFEST" ]; then
    echo "ascurix: unable to find $EVAL_MANIFEST -- run ascurix from inside the project." >&2
    return 1
  fi
  cargo run --quiet --bin eval --manifest-path "$root/$EVAL_MANIFEST" -- "$@"
}
