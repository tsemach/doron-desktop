use clap::Args;

#[derive(Args, Debug, Clone)]
pub struct ExamplesArgs {}

pub async fn execute(_args: ExamplesArgs) -> Result<(), String> {
    println!("Email evaluation examples:\n");
    println!("  # Copy fixture dataset to a corpus directory");
    println!("  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml email generate --corpus-dir ./email_eval_corpus\n");
    println!("  # Inject-only (CI): no LLM, uses injected classifications in fixtures");
    println!("  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml email run --inject-only --corpus-dir tests/email/fixtures\n");
    println!("  # Local LLM benchmark: start the app (or sidecar on :10086), then:");
    println!("  cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml email run --provider local --model \"Phi-4-mini-instruct (3.8B Q4)\" --corpus-dir ./email_eval_corpus");
    Ok(())
}
