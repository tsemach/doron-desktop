mod document;
mod email;
mod sidecar;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(
    name = "eval",
    version = "1.0",
    about = "Evaluation pipeline CLI for Document Scan, Index, Search, and Email Classification"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(clap::Subcommand, Clone, Debug)]
pub enum Commands {
    /// Document-related evaluation commands
    Document(document::DocumentArgs),

    /// Email-related evaluation commands
    Email(email::EmailArgs),
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Document(doc_args) => match doc_args.command {
            document::DocumentCommands::Run(args) => document::run::execute(args).await,
            document::DocumentCommands::Generate(args) => document::generate::execute(args).await,
            document::DocumentCommands::List(args) => document::list::execute(args).await,
            document::DocumentCommands::Compare(args) => document::compare::execute(args).await,
            document::DocumentCommands::Show(args) => document::show::execute(args).await,
            document::DocumentCommands::Examples(args) => document::examples::execute(args).await,
            document::DocumentCommands::Readme(args) => document::readme::execute(args).await,
        },
        Commands::Email(email_args) => match email_args.command {
            email::EmailCommands::Examples(args) => email::examples::execute(args).await,
            email::EmailCommands::Generate(args) => email::generate::execute(args).await,
            email::EmailCommands::Run(args) => email::run::execute(args).await,
            email::EmailCommands::List(args) => email::list::execute(args).await,
            email::EmailCommands::Show(args) => email::show::execute(args).await,
        },
    };

    if let Err(e) = result {
        eprintln!("\x1b[31mError:\x1b[0m {}", e);
        std::process::exit(1);
    }
}
