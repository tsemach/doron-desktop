use clap::Args;

#[derive(Args, Debug, Clone)]
pub struct ShowArgs {}

pub async fn execute(_args: ShowArgs) -> Result<(), String> {
    println!("Email subcommand 'show' called");
    Ok(())
}
