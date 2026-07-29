//! `eval email show <id>` — full detail for one recorded matcher run.

use clap::Args;

use super::history;

#[derive(Args, Debug, Clone)]
pub struct ShowArgs {
    /// Run id from `eval email list`
    pub run_id: i64,
}

pub async fn execute(args: ShowArgs) -> Result<(), String> {
    for (key, value) in history::show(args.run_id)? {
        println!("{key:<16} {value}");
    }
    Ok(())
}
