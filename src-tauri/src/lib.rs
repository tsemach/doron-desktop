use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub mod store;
pub mod extractor;
pub mod llm;
pub mod indexer;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize, Deserialize)]
pub struct Case {
    pub id: i64,
    pub subject: Option<String>,
    pub status: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: Option<String>,
}



#[tauri::command]
fn add_case(
    app: AppHandle,
    subject: String,
    status: String,
    name: String,
    created_at: String,
) -> Result<Case, String> {
    let conn = store::open_db(&app)?;
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![subject, status, name, created_at],
    ).map_err(|e| format!("[insert case] {e}"))?;
    let id = conn.last_insert_rowid();
    Ok(Case { id, subject: Some(subject), status, name, created_at, updated_at: None })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.center().ok();
                window.maximize().ok();
                window.show().ok();
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, store::get_db_path, add_case, indexer::index_folder, indexer::index_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
