pub mod examples;
pub mod generate;
pub mod run;
pub mod list;
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

    /// Generate synthetic email data or classification examples
    Generate(generate::GenerateArgs),

    /// Run the email classification evaluation pipeline
    Run(run::RunArgs),

    /// List historical email evaluation runs
    List(list::ListArgs),

    /// Show detailed analysis of a specific email evaluation run
    Show(show::ShowArgs),
}
