//! `eval email list` — recorded matcher eval runs, newest first.

use clap::Args;

use super::history;

#[derive(Args, Debug, Clone)]
pub struct ListArgs {
    /// Maximum number of runs to show
    #[arg(long, default_value = "20")]
    pub limit: usize,
}

pub async fn execute(args: ListArgs) -> Result<(), String> {
    let runs = history::list(args.limit)?;
    if runs.is_empty() {
        println!("No matcher eval runs recorded yet. Run 'eval email run --mode matcher'.");
        return Ok(());
    }

    println!(
        "{:<5} {:<26} {:<18} {:>7} {:>10} {:>6} {:>9}",
        "id", "run_at", "label", "emails", "accuracy@1", "f1", "mislinks"
    );
    for r in runs {
        println!(
            "{:<5} {:<26} {:<18} {:>7} {:>9.1}% {:>6.2} {:>9}",
            r.id,
            r.run_at,
            r.label.unwrap_or_default(),
            r.emails,
            r.accuracy_at_1,
            r.f1,
            r.mislinks
        );
    }
    Ok(())
}
