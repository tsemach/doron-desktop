# `ascurix email ...` -- email classification evaluation. Forwards to the
# Rust `eval` CLI's `email` subcommand
# (apps/desktop/src-tauri/src/bin/eval), e.g. `ascurix email generate ...`
# becomes `cargo run --bin eval -- email generate ...`.

cmd_email() {
  require_git_worktree
  run_eval_binary email "$@"
}
