use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

mod store;
mod extractor;
mod llm;

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


#[derive(Serialize, Clone)]
struct IndexProgress {
    current: usize,
    total: usize,
    file_name: String,
    status: String,
    message: String,
}

#[derive(Serialize)]
struct IndexSummary {
    indexed: usize,
    skipped: usize,
    failed: usize,
}

#[tauri::command]
async fn index_folder(
    app: AppHandle,
    folder_path: String,
    api_key: String,
    model: Option<String>,
    reindex: Option<bool>,
) -> Result<IndexSummary, String> {
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let reindex = reindex.unwrap_or(false);

    let supported = ["docx", "pdf", "xlsx", "xls"];
    let files: Vec<std::path::PathBuf> = walkdir::WalkDir::new(&folder_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| supported.contains(&s.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    if files.is_empty() {
        return Ok(IndexSummary { indexed: 0, skipped: 0, failed: 0 });
    }

    let total = files.len();
    let mut indexed = 0usize;
    let mut skipped = 0usize;
    let mut failed = 0usize;

    for (i, path) in files.iter().enumerate() {
        let current = i + 1;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let path_str = path.to_string_lossy().to_string();

        // skip check — conn dropped before any await
        if !reindex {
            let conn = store::open_db(&app)?;
            if store::is_already_indexed(&conn, &path_str).map_err(|e| e.to_string())? {
                skipped += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "skipped".to_string(),
                    message: "already indexed".to_string(),
                });
                continue;
            }
        }

        // extract text
        let extracted = match extractor::extract(path) {
            Ok(e) if !e.text.trim().is_empty() => e,
            Ok(_) => {
                skipped += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "skipped".to_string(),
                    message: "no text extracted".to_string(),
                });
                continue;
            }
            Err(e) => {
                failed += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "failed".to_string(),
                    message: format!("extraction failed: {e}"),
                });
                continue;
            }
        };

        // call Claude — no conn held across this await
        let metadata = match llm::call_claude(&extracted.text, &api_key, &model).await {
            Ok(m) => m,
            Err(e) => {
                failed += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "failed".to_string(),
                    message: format!("API error: {e}"),
                });
                continue;
            }
        };

        // build record
        let file_size_kb = std::fs::metadata(path).map(|m| m.len() as i64 / 1024).unwrap_or(0);
        let file_ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let raw_metadata = serde_json::to_string(&metadata).unwrap_or_default();
        let msg = format!(
            "[{}] {}",
            metadata.doc_type.as_deref().unwrap_or("?"),
            metadata.title.as_deref().unwrap_or("(no title)")
        );

        let record = store::DocumentRecord {
            file_path: path_str,
            file_name: file_name.clone(),
            file_ext,
            file_size_kb,
            doc_type: metadata.doc_type,
            title: metadata.title,
            summary: metadata.summary,
            authors:   serde_json::to_string(&metadata.authors.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
            doc_date:  metadata.date,
            topics:    serde_json::to_string(&metadata.topics.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
            entities:  serde_json::to_string(&metadata.entities.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
            keywords:  serde_json::to_string(&metadata.keywords.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
            language:  metadata.language,
            page_count: extracted.page_count,
            confidence: metadata.confidence,
            raw_metadata,
        };

        // insert — fresh conn after the await
        let conn = store::open_db(&app)?;
        match store::insert_document(&conn, &record) {
            Ok(_) => {
                indexed += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "ok".to_string(),
                    message: msg,
                });
            }
            Err(e) => {
                failed += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "failed".to_string(),
                    message: format!("DB error: {e}"),
                });
            }
        }
    }

    Ok(IndexSummary { indexed, skipped, failed })
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
        .invoke_handler(tauri::generate_handler![greet, store::get_db_path, add_case, index_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
