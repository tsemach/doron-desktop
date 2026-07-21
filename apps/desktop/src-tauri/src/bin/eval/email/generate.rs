use clap::Args;
use std::fs;
use std::path::Path;

#[derive(Args, Debug, Clone)]
pub struct GenerateArgs {
    /// Output directory for the email evaluation fixture dataset
    #[arg(long, default_value = "./email_eval_corpus")]
    pub corpus_dir: String,
}

pub async fn execute(args: GenerateArgs) -> Result<(), String> {
    let corpus_path = Path::new(&args.corpus_dir);
    fs::create_dir_all(corpus_path)
        .map_err(|e| format!("Failed to create corpus directory: {e}"))?;

    let source = Path::new("tests/email/fixtures/email_classification_dataset.json");
    if !source.exists() {
        return Err(format!(
            "Source fixture file not found at '{}'",
            source.display()
        ));
    }

    let dest = corpus_path.join("email_classification_dataset.json");
    fs::copy(source, &dest).map_err(|e| format!("Failed to copy fixture dataset: {e}"))?;

    println!(
        "Email evaluation dataset written to: {}",
        dest.display()
    );
    println!("Run with: cargo run --bin eval -- email run --corpus-dir {}", args.corpus_dir);
    Ok(())
}
