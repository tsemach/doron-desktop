use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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

fn db_path(app: &AppHandle) -> std::path::PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("documents.db")
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let uri = format!("file:{}?nolock=1", path.to_string_lossy());
    let conn = Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_URI,
    ).map_err(|e| e.to_string())?;
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS cases (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            subject     TEXT,
            status      TEXT    NOT NULL DEFAULT 'open',
            name        TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            updated_at  TEXT
        );
    ").map_err(|e| e.to_string())?;
    Ok(conn)
}

#[tauri::command]
fn get_db_path(app: AppHandle) -> String {
    db_path(&app).to_string_lossy().to_string()
}

#[tauri::command]
fn add_case(
    app: AppHandle,
    subject: String,
    status: String,
    name: String,
    created_at: String,
) -> Result<Case, String> {
    let conn = open_db(&app)?;
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![subject, status, name, created_at],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Case { id, subject: Some(subject), status, name, created_at, updated_at: None })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_db_path, add_case])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
