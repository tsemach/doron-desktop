use clap::Args;
use std::path::{Path, PathBuf};

use tauri_app_lib::llm::llm_provider::{get_active_provider, ProviderConfig};

use super::dataset::{load_fixtures, print_report, run_fixture_suite, summarize, EmailEvalFixture};

#[derive(Args, Debug, Clone)]
pub struct RunArgs {
    /// Directory containing email_classification_dataset.json
    #[arg(long, default_value = "./email_eval_corpus")]
    pub corpus_dir: String,

    /// LLM provider (local, claude, gemini, openai). Ignored with --inject-only.
    #[arg(long, default_value = "local")]
    pub provider: String,

    /// LLM model name
    #[arg(long, default_value = "Phi-4-mini-instruct (3.8B Q4)")]
    pub model: String,

    /// API key for online providers
    #[arg(long)]
    pub api_key: Option<String>,

    /// Base URL for local llama-server sidecar
    #[arg(long, default_value = "http://127.0.0.1:10086/v1")]
    pub base_url: String,

    /// Skip LLM; use injected classifications from fixtures (CI / matcher regression)
    #[arg(long)]
    pub inject_only: bool,
}

fn resolve_dataset_file(corpus_dir: &str) -> Result<PathBuf, String> {
    let corpus_path = Path::new(corpus_dir);
    let dataset_file = if corpus_path.exists() && corpus_path.is_dir() {
        let path_in_corpus = corpus_path.join("email_classification_dataset.json");
        if path_in_corpus.exists() {
            path_in_corpus
        } else {
            PathBuf::from("tests/email/fixtures/email_classification_dataset.json")
        }
    } else {
        PathBuf::from("tests/email/fixtures/email_classification_dataset.json")
    };

    if dataset_file.exists() {
        Ok(dataset_file)
    } else {
        Err(format!(
            "Dataset not found at '{}'. Run 'eval email generate' first.",
            dataset_file.display()
        ))
    }
}

pub async fn execute(args: RunArgs) -> Result<(), String> {
    let dataset_file = resolve_dataset_file(&args.corpus_dir)?;
    let fixtures: Vec<EmailEvalFixture> = load_fixtures(&dataset_file)?;

    if args.inject_only {
        println!(
            "Running inject-only eval (fixtures={}, no LLM)",
            fixtures.len()
        );
    } else {
        println!(
            "Running LLM email eval (provider={}, model={}, fixtures={})",
            args.provider, args.model, fixtures.len()
        );
    }

    let provider = get_active_provider(ProviderConfig {
        provider_type: if args.inject_only {
            "mock".to_string()
        } else {
            args.provider.clone()
        },
        api_key: args.api_key.unwrap_or_default(),
        model: args.model.clone(),
        base_url: if args.inject_only {
            None
        } else {
            Some(args.base_url.clone())
        },
    });

    let outcomes = run_fixture_suite(&provider, &fixtures, args.inject_only).await?;
    let summary = summarize(&fixtures, &outcomes);
    print_report(&summary, &outcomes, &fixtures);

    if summary.false_negatives > 0 {
        for failure in &summary.failures {
            if failure.contains("FALSE NEGATIVE") {
                eprintln!("  FAIL: {failure}");
            }
        }
        return Err(format!(
            "{} false negative(s) — business emails missed.",
            summary.false_negatives
        ));
    }

    if summary.false_positives > 0 {
        eprintln!(
            "\nWarning: {} false positive(s) — non-business emails surfaced for review.",
            summary.false_positives
        );
        for failure in &summary.failures {
            if failure.contains("FALSE POSITIVE") {
                eprintln!("  WARN: {failure}");
            }
        }
    }

    Ok(())
}
