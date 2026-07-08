use clap::Args;

#[derive(Args, Debug, Clone)]
pub struct RunArgs {}

pub async fn execute(_args: RunArgs) -> Result<(), String> {
    println!("Email subcommand 'run' called");
    Ok(())
}
