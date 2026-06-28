use clap::Args;
use tauri_app_lib::store;

#[derive(Args, Debug, Clone)]
pub struct ShowArgs {
    /// The ID of the evaluation run to display
    pub run_id: i64,

    /// Name/path of the SQLite database to read history from
    #[arg(long, default_value = "evaluation_history.db")]
    pub db_name: String,
}

pub async fn execute(args: ShowArgs) -> Result<(), String> {
    let db_path = store::cli_db_path(&args.db_name);
    if !db_path.exists() {
        return Err(format!(
            "No evaluation history database found at {}. Please run an evaluation first.",
            db_path.display()
        ));
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open history database: {}", e))?;

    super::history::show_run_details(&conn, args.run_id)
}
