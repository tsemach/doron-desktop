use clap::Args;

#[derive(Args, Debug, Clone)]
pub struct ListArgs {}

pub async fn execute(_args: ListArgs) -> Result<(), String> {
    println!("Email subcommand 'list' called");
    Ok(())
}
