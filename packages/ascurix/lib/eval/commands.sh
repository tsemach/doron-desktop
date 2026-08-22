# `ascurix eval ...` -- document evaluation. Forwards to the Rust `eval`
# CLI's `document` subcommand (apps/desktop/src-tauri/src/bin/eval), e.g.
# `ascurix eval run --provider mock --algorithm hybrid --corpus-dir ./x`
# becomes `cargo run --bin eval -- document run ...`.

cmd_eval() {
  require_git_worktree
  run_eval_binary document "$@"
}
