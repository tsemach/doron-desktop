mod dataset;

pub mod corpus;
pub mod corpus_stats;
pub mod docx_writer;
pub mod examples;
pub mod generate;
pub mod list;
pub mod rng;
pub mod run;
pub mod show;

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

    /// Run the email classification evaluation pipeline
    Run(run::RunArgs),

    /// List historical email evaluation runs
    List(list::ListArgs),

    /// Show detailed analysis of a specific email evaluation run
    Show(show::ShowArgs),
}
