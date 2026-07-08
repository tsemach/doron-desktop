pub mod compare;
pub mod examples;
pub mod generate;
pub mod list;
pub mod readme;
pub mod run;
pub mod show;

use clap::{Args, Subcommand};

#[derive(Args, Clone, Debug)]
pub struct DocumentArgs {
    #[command(subcommand)]
    pub command: DocumentCommands,
}

#[derive(Subcommand, Clone, Debug)]
pub enum DocumentCommands {
    /// Run the evaluation metrics pipeline on a labeled dataset
    Run(run::RunArgs),

    /// Generate a synthetic corpus of files for retrieval testing
    Generate(generate::GenerateArgs),

    /// List all historical evaluation runs
    List(list::ListArgs),

    /// Compare two evaluation runs side-by-side
    Compare(compare::CompareArgs),

    /// Show detailed query-by-query analysis of a specific evaluation run
    Show(show::ShowArgs),

    /// Show help examples of commands
    Examples(examples::ExamplesArgs),

    /// Show detailed readme explanation of the tool
    Readme(readme::ReadmeArgs),
}
