mod run;
mod generate;
mod history;
mod compare;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "eval",
    version = "1.0",
    about = "Evaluation pipeline CLI for Document Scan, Index, and Search"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(clap::Subcommand, Clone, Debug)]
pub enum Commands {
    /// Run the evaluation metrics pipeline on a labeled dataset
    Run(run::RunArgs),

    /// Generate a synthetic corpus of files for retrieval testing
    GenerateCorpus(generate::GenerateArgs),

    /// List or inspect historical evaluation runs
    History(history::HistoryArgs),

    /// Compare two evaluation runs side-by-side
    Compare(compare::CompareArgs),
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Run(args) => run::execute(args).await,
        Commands::GenerateCorpus(args) => generate::execute(args).await,
        Commands::History(args) => history::execute(args).await,
        Commands::Compare(args) => compare::execute(args).await,
    };

    if let Err(e) = result {
        eprintln!("\x1b[31mError:\x1b[0m {}", e);
        std::process::exit(1);
    }
}
