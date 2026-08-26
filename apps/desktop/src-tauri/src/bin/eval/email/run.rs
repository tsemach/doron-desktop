use clap::Args;
use std::path::{Path, PathBuf};

use crate::provider::resolve_eval_provider;

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

    /// What to evaluate: `matcher` (deterministic case matching, the default),
    /// `classification` (the legacy LLM review/search_terms eval)
    #[arg(long, default_value = "matcher")]
    pub mode: String,

    /// Reuse the existing scratch index database instead of rebuilding it (matcher mode).
    /// Much faster, but stale if the corpus or the indexers changed.
    #[arg(long)]
    pub reuse: bool,

    /// List every failing fixture
    #[arg(long)]
    pub verbose: bool,

    /// Short label recorded with the run, e.g. "p4-tier-a"
    #[arg(long)]
    pub label: Option<String>,

    /// Grid-search review threshold × content weight × ambiguity margin and report both
    /// the F1-optimal and the highest-recall mislink-free operating point
    #[arg(long)]
    pub sweep: bool,

    /// Report each signal's marginal contribution by removing it and re-scoring
    #[arg(long)]
    pub ablate: bool,

    /// Also score with the signals that only exist after a confirmation removed
    /// (`thread_ref`, `sender_confirmed`) — day-one accuracy rather than steady state
    #[arg(long)]
    pub cold_start: bool,

    /// Print the sweep's shipping operating point as the exact `config.rs` defaults to set
    #[arg(long)]
    pub apply: bool,
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
    match args.mode.as_str() {
        "matcher" => return run_matcher(&args).await,
        "classification" => {}
        other => {
            return Err(format!(
                "Unknown --mode '{other}' (expected matcher | classification)"
            ))
        }
    }

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

    // There is no local AI anymore, and (unlike document eval's indexing/
    // query-analysis) email classification has no heuristic-only fallback
    // to run instead -- run_fixture_suite's classification step always
    // needs a real LLM call. Fail clearly rather than silently resolving
    // to a provider that was never invoked or a dead llama-server sidecar.
    if !args.inject_only && args.provider.to_lowercase() == "local" {
        return Err(
            "provider=local is no longer supported for email eval (there is no local AI anymore). Use --provider online (reuses the desktop app's signed-in session) or --inject-only for a no-LLM run."
                .to_string(),
        );
    }

    let provider = if args.inject_only {
        resolve_eval_provider("mock", &args.model, None, "email_classification")?
    } else {
        resolve_eval_provider(
            &args.provider,
            &args.model,
            args.api_key.clone(),
            "email_classification",
        )?
    };

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

/// Deterministic matcher evaluation. **Mislink rate is the gate**: linking an email to
/// the wrong matter is the failure a user cannot easily undo, so any occurrence fails the
/// run. `medium`/`hard` are expected to be poor until Tiers B/C land in P5 — this run
/// records the baseline they will be measured against.
async fn run_matcher(args: &RunArgs) -> Result<(), String> {
    if args.sweep || args.ablate || args.cold_start {
        return run_tuning(args).await;
    }

    let (summary, cases, config_json) =
        super::matcher_run::run(&args.corpus_dir, args.reuse, args.verbose).await?;

    match super::history::save(&summary, &args.corpus_dir, cases, args.label.as_deref(), &config_json) {
        Ok(id) => println!("\nRecorded as run {id}  (eval email show {id})"),
        // A history failure must not fail the evaluation itself.
        Err(e) => eprintln!("\nWarning: could not record run: {e}"),
    }

    if summary.mislinks > 0 {
        for failure in summary.failures.iter().filter(|f| f.contains("MISLINK")) {
            eprintln!("  {failure}");
        }
        return Err(format!(
            "{} email(s) linked to the wrong case — the one failure a user cannot undo.",
            summary.mislinks
        ));
    }
    // Auto-linking an email that two cases legitimately compete for defeats the
    // ambiguity guard, and is as unrecoverable for the user as a mislink.
    if summary.ambiguity_failures > 0 {
        for failure in summary.failures.iter().filter(|f| f.contains("AMBIGUITY")) {
            eprintln!("  {failure}");
        }
        return Err(format!(
            "{} ambiguous email(s) were auto-linked despite a competing case.",
            summary.ambiguity_failures
        ));
    }
    if summary.false_positives > 0 {
        eprintln!(
            "\nWarning: {} email(s) belonging to no case were linked anyway.",
            summary.false_positives
        );
    }
    Ok(())
}

/// Signals that cannot exist before a user has ever confirmed an email to a case:
/// `thread_ref` resolves through `case_emails`, and `sender_confirmed` requires an
/// identifier this pipeline only writes on confirmation. Removing both is what day one
/// actually looks like (design §10.2).
const LEARNED_SIGNALS: &[&str] = &["thread_ref", "sender_confirmed"];

/// `--sweep` / `--ablate` / `--cold-start`. Never records a run: these are diagnostics over
/// a single collection pass, and writing a dozen re-scorings into the history would make
/// `eval email list` useless for tracking phases.
async fn run_tuning(args: &RunArgs) -> Result<(), String> {
    use super::sweep;

    let collected = super::matcher_run::collect(&args.corpus_dir, args.reuse).await?;
    let baseline = sweep::score_all(&collected.scored, &collected.config, sweep::Signals::All);

    println!(
        "\n--- Baseline at current defaults ({} emails, {} cases) ---",
        baseline.total, collected.cases
    );
    println!(
        "accuracy@1 {:.1}%   recall {:.2}   F1 {:.2}   mislinks {}",
        baseline.accuracy_at_1, baseline.recall, baseline.f1, baseline.mislinks
    );

    if args.cold_start {
        // Removed rather than zero-weighted: a zero-weighted signal still makes its case a
        // candidate, which is not what "this identifier does not exist yet" means.
        let cold_summary = sweep::score_all(
            &collected.scored,
            &collected.config,
            sweep::Signals::Without(LEARNED_SIGNALS),
        );
        println!("\n--- Cold start (no email ever confirmed) ---");
        println!(
            "accuracy@1 {:.1}%   recall {:.2}   F1 {:.2}   mislinks {}",
            cold_summary.accuracy_at_1,
            cold_summary.recall,
            cold_summary.f1,
            cold_summary.mislinks
        );
        println!(
            "steady state is +{:.1} points — what confirmations buy over time",
            baseline.accuracy_at_1 - cold_summary.accuracy_at_1
        );
        for (difficulty, stats) in &cold_summary.per_difficulty {
            println!(
                "  {:<14} {:>3}/{:<3} ({:>5.1}%)",
                difficulty.label(),
                stats.correct,
                stats.total,
                stats.pct()
            );
        }
    }

    if args.ablate {
        let ablations = sweep::run_ablation(&collected.scored, &collected.config, &baseline);
        sweep::print_ablation(&ablations);
    }

    if args.sweep {
        let points = sweep::run_grid(&collected.scored, &collected.config);
        sweep::print_grid(&points, &collected.config);

        if args.apply {
            let Some(point) = sweep::best_safe(&points, &collected.config) else {
                return Err(
                    "Refusing to apply: no mislink-free operating point on this corpus."
                        .to_string(),
                );
            };
            if sweep::is_status_quo(point, &collected.config) {
                println!(
                    "\nNothing to apply: no mislink-free point beats the current defaults."
                );
                return Ok(());
            }
            let tuned = point.config_from(&collected.config);
            // Printed rather than written: the eval's scratch database is rebuilt on the
            // next run, so persisting there would ship nothing. These are the shipping
            // defaults, and they belong in `config.rs` under review like any other change.
            println!("\n--- Apply to MatcherConfig::default() in email/case_matcher/config.rs ---");
            println!("    review_threshold: {:.2},", tuned.review_threshold);
            println!("    ambiguity_margin: {:.2},", tuned.ambiguity_margin);
            println!("    // in SignalWeights::default()");
            println!("    content: {:.2},", tuned.weights.content);
            println!(
                "\n{}",
                serde_json::to_string(&tuned).unwrap_or_default()
            );
        }
    }
    Ok(())
}
