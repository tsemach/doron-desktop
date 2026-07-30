mod dataset;

pub mod compare;
pub mod corpus;
pub mod corpus_stats;
pub mod docx_writer;
pub mod harness;
pub mod history;
pub mod history_compare;
pub mod index_cmd;
pub mod matcher_metrics;
pub mod matcher_run;
pub mod signals_cmd;
pub mod examples;
pub mod generate;
pub mod list;
pub mod real;
pub mod rng;
pub mod run;
pub mod show;
pub mod sweep;

use clap::{Args, Subcommand};

#[derive(Args, Clone, Debug)]
pub struct EmailArgs {
    #[command(subcommand)]
    pub command: EmailCommands,
}

#[derive(Subcommand, Clone, Debug)]
pub enum EmailCommands {
    /// Show help examples of email evaluation commands
    Examples(examples::ExamplesArgs),

    /// Generate a synthetic email→case corpus with ground-truth labels
    Generate(generate::GenerateArgs),

    /// Report composition and integrity of a generated corpus
    CorpusStats(corpus_stats::CorpusStatsArgs),

    /// Build the matcher indexes from a corpus and report their health
    Index(index_cmd::IndexArgs),

    /// Score signal extraction (and attachment reading) against the corpus ground truth
    Signals(signals_cmd::SignalsArgs),

    /// Run the email classification evaluation pipeline
    Run(run::RunArgs),

    /// List historical email evaluation runs
    List(list::ListArgs),

    /// Show detailed analysis of a specific email evaluation run
    Show(show::ShowArgs),

    /// Compare two recorded matcher runs, with per-difficulty deltas
    Compare(compare::CompareArgs),

    /// Run the matcher over real mail exported from the configured account
    Real(real::RealArgs),
}
