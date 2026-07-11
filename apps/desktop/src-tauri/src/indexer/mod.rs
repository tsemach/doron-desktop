use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static SHOULD_STOP_INDEXING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn stop_indexing() {
    SHOULD_STOP_INDEXING.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn get_active_indexing_sessions(app: AppHandle) -> Result<Vec<store::IndexingSession>, String> {
    let db_path = store::db_path(&app);
    let conn = store::open_db_by_path(&db_path).map_err(|e| e.to_string())?;
    let sessions = store::get_active_indexing_sessions(&conn).map_err(|e| e.to_string())?;
    Ok(sessions)
}

#[tauri::command]
pub fn delete_indexing_session(app: AppHandle, path: String) -> Result<(), String> {
    let db_path = store::db_path(&app);
    let conn = store::open_db_by_path(&db_path).map_err(|e| e.to_string())?;
    store::delete_indexing_session(&conn, &path).map_err(|e| e.to_string())
}

use crate::{extractor, llm, store};
use crate::llm::llm_provider::LlmProvider;

#[derive(Serialize, Clone)]
struct IndexProgress {
    current: usize,
    total: usize,
    file_name: String,
    status: String,
    message: String,
}

#[derive(Serialize)]
pub struct IndexSummary {
    pub indexed: usize,
    pub skipped: usize,
    pub failed: usize,
}

pub struct IndexOptions {
    pub run_llm_metadata: bool,
    pub run_vector_embeddings: bool,
}

/// Core decoupled document indexing function.
/// Takes db_path instead of active Connection so it can drop SQLite locks before async awaits.
pub async fn index_file_core(
    db_path: &Path,
    provider: &LlmProvider,
    file_path: &Path,
    options: &IndexOptions,
    reindex: bool,
) -> Result<String, String> {
    let result = index_file_core_impl(db_path, provider, file_path, options, reindex).await;
    if result.is_err() {
        let path_str = file_path.to_string_lossy().to_string();
        if let Ok(conn) = store::open_db_by_path(db_path) {
            let _ = store::delete_document_by_path(&conn, &path_str);
        }
    }
    result
}

async fn index_file_core_impl(
    db_path: &Path,
    provider: &LlmProvider,
    file_path: &Path,
    options: &IndexOptions,
    reindex: bool,
) -> Result<String, String> {
    let path_str = file_path.to_string_lossy().to_string();
    
    // Check if file is already indexed
    if !reindex {
        let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
        if store::is_already_indexed(&conn, &path_str).map_err(|e| e.to_string())? {
            return Ok("already indexed".to_string());
        }
    }

    if SHOULD_STOP_INDEXING.load(Ordering::SeqCst) {
        return Err("Indexing stopped by user".to_string());
    }

    let ext = file_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    // Extract text from the file
    let extracted = extractor::extract(file_path).map_err(|e| format!("extraction failed: {e}"))?;
    if extracted.text.trim().is_empty() {
        return Err("no text extracted".to_string());
    }

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut doc_id_opt = {
        let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
        store::get_document_id_by_path(&conn, &path_str).map_err(|e| e.to_string())?
    };

    // Track 1: LLM Metadata extraction
    if options.run_llm_metadata {
        let metadata = tokio::select! {
            res = llm::call_provider(provider, &extracted.text) => res?,
            _ = async {
                while !SHOULD_STOP_INDEXING.load(Ordering::SeqCst) {
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
            } => return Err("Indexing stopped by user".to_string()),
        };
        let file_size_kb = std::fs::metadata(file_path).map(|m| m.len() as i64 / 1024).unwrap_or(0);
        let raw_metadata = serde_json::to_string(&metadata).unwrap_or_default();
        
        let doc_type_str = match &metadata.doc_type {
            Some(serde_json::Value::Object(map)) => serde_json::to_string(map).ok(),
            Some(serde_json::Value::String(s)) => Some(s.clone()),
            Some(other) => Some(other.to_string()),
            None => None,
        };

        let record = store::DocumentRecord {
            file_path: path_str.clone(),
            file_name: file_name.clone(),
            file_ext: ext.clone(),
            file_size_kb,
            doc_type: doc_type_str,
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
            raw_text: extracted.text.clone(),
        };

        let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
        store::insert_document(&conn, &record).map_err(|e| format!("DB insertion failed: {e}"))?;
        doc_id_opt = store::get_document_id_by_path(&conn, &path_str).map_err(|e| e.to_string())?;
    } else if doc_id_opt.is_none() {
        // Fallback skeletal insertion so we have a document_id to map vector chunks to
        let file_size_kb = std::fs::metadata(file_path).map(|m| m.len() as i64 / 1024).unwrap_or(0);
        let record = store::DocumentRecord {
            file_path: path_str.clone(),
            file_name: file_name.clone(),
            file_ext: ext.clone(),
            file_size_kb,
            doc_type: Some("other".to_string()),
            title: Some(file_name.clone()),
            summary: Some("Skeletal document (indexed without LLM metadata)".to_string()),
            authors: "[]".to_string(),
            doc_date: None,
            topics: "[]".to_string(),
            entities: "[]".to_string(),
            keywords: "[]".to_string(),
            language: Some("he".to_string()),
            page_count: extracted.page_count,
            confidence: None,
            raw_metadata: "{}".to_string(),
            raw_text: extracted.text.clone(),
        };
        
        let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
        store::insert_document(&conn, &record).map_err(|e| format!("DB fallback insertion failed: {e}"))?;
        doc_id_opt = store::get_document_id_by_path(&conn, &path_str).map_err(|e| e.to_string())?;
    }

    let doc_id = doc_id_opt.ok_or_else(|| "Failed to retrieve document ID".to_string())?;

    if SHOULD_STOP_INDEXING.load(Ordering::SeqCst) {
        return Err("Indexing stopped by user".to_string());
    }

    // Track 2: Vector Embeddings generation
    if options.run_vector_embeddings {
        let chunks = crate::embeddings::chunk_text(&extracted.text, 1000, 200);
        if !chunks.is_empty() {
            let embeddings = crate::embeddings::get_passage_embeddings(&chunks)
                .map_err(|e| format!("Failed generating passage embeddings: {e}"))?;
            
            let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
            // Clear any prior chunks
            let _ = store::delete_document_chunks(&conn, doc_id);
            for (idx, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                let emb_bytes = crate::embeddings::vec_to_bytes(emb);
                store::insert_document_chunk(&conn, doc_id, idx as i32, chunk, &emb_bytes)
                    .map_err(|e| format!("Failed storing chunk embedding: {e}"))?;
            }
        }
    }

    let status_str = match (options.run_llm_metadata, options.run_vector_embeddings) {
        (true, true) => "Indexed with LLM metadata and vector chunks",
        (true, false) => "Indexed with LLM metadata only",
        (false, true) => "Indexed with vector chunks only (fallback metadata)",
        (false, false) => "Text extracted only (no db update)",
    };

    Ok(format!("{status_str} for {file_name}"))
}

#[tauri::command]
pub async fn index_file(
    app: AppHandle,
    file_path: String,
    api_key: String,
    model: Option<String>,
    reindex: Option<bool>,
) -> Result<IndexSummary, String> {
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let reindex = reindex.unwrap_or(false);

    let path = std::path::Path::new(&file_path);
    let supported = ["docx", "pdf", "xlsx", "xls", "txt"];

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    if !supported.contains(&ext.as_str()) {
        return Err(format!("Unsupported file type: .{ext}"));
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let emit_progress = |status: &str, message: &str| {
        let _ = app.emit("indexing-progress", IndexProgress {
            current: 1,
            total: 1,
            file_name: file_name.clone(),
            status: status.to_string(),
            message: message.to_string(),
        });
    };

    emit_progress("processing", "starting...");
    
    let db_path = store::db_path(&app);

    // Skip check
    if !reindex {
        let conn = store::open_db_by_path(&db_path)?;
        if store::is_already_indexed(&conn, &file_path).map_err(|e| e.to_string())? {
            emit_progress("skipped", "already indexed");
            return Ok(IndexSummary { indexed: 0, skipped: 1, failed: 0 });
        }
    }

    // Set up provider configuration
    let provider = crate::llm::load_active_provider(&app, api_key, Some(model));

    let options = IndexOptions {
        run_llm_metadata: true,
        run_vector_embeddings: true,
    };

    emit_progress("processing", "indexing tracks...");
    match index_file_core(&db_path, &provider, path, &options, reindex).await {
        Ok(msg) => {
            emit_progress("ok", &msg);
            Ok(IndexSummary { indexed: 1, skipped: 0, failed: 0 })
        }
        Err(e) => {
            emit_progress("failed", &e);
            Ok(IndexSummary { indexed: 0, skipped: 0, failed: 1 })
        }
    }
}

#[tauri::command]
pub async fn index_folder(
    app: AppHandle,
    folder_path: String,
    api_key: String,
    model: Option<String>,
    reindex: Option<bool>,
    start_index: Option<usize>,
) -> Result<IndexSummary, String> {
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let reindex = reindex.unwrap_or(false);
    println!("index_folder invoked: start_index = {:?}", start_index);

    let supported = ["docx", "pdf", "xlsx", "xls", "txt"];
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

    // Set up provider configuration
    let provider = crate::llm::load_active_provider(&app, api_key, Some(model));

    let options = IndexOptions {
        run_llm_metadata: true,
        run_vector_embeddings: true,
    };
    
    let db_path = store::db_path(&app);
    let db_conn = store::open_db_by_path(&db_path).ok();
    
    let mut already_indexed = std::collections::HashSet::new();
    if !reindex {
        if let Some(ref conn) = db_conn {
            for path in &files {
                let path_str = path.to_string_lossy().to_string();
                if let Ok(true) = store::is_already_indexed(&conn, &path_str) {
                    already_indexed.insert(path_str);
                }
            }
        }
    }

    let skip_count = start_index.unwrap_or(0);

    if let Some(ref conn) = db_conn {
        let session = store::IndexingSession {
            path: folder_path.clone(),
            is_folder: true,
            reindex,
            start_index: skip_count,
            total_files: total,
            status: "running".to_string(),
            updated_at: chrono::Local::now().to_rfc3339(),
        };
        let _ = store::save_indexing_session(conn, &session);
    }

    SHOULD_STOP_INDEXING.store(false, Ordering::SeqCst);

    for (i, path) in files.iter().enumerate().skip(skip_count) {
        if SHOULD_STOP_INDEXING.load(Ordering::SeqCst) {
            if let Some(ref conn) = db_conn {
                let session = store::IndexingSession {
                    path: folder_path.clone(),
                    is_folder: true,
                    reindex,
                    start_index: i,
                    total_files: total,
                    status: "stopped".to_string(),
                    updated_at: chrono::Local::now().to_rfc3339(),
                };
                let _ = store::save_indexing_session(conn, &session);
            }
            let _ = app.emit("indexing-progress", IndexProgress {
                current: i,
                total,
                file_name: "".to_string(),
                status: "failed".to_string(),
                message: "Indexing stopped by user".to_string(),
            });
            break;
        }

        if let Some(ref conn) = db_conn {
            let session = store::IndexingSession {
                path: folder_path.clone(),
                is_folder: true,
                reindex,
                start_index: i,
                total_files: total,
                status: "running".to_string(),
                updated_at: chrono::Local::now().to_rfc3339(),
            };
            let _ = store::save_indexing_session(conn, &session);
        }

        let current = i + 1;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let path_str = path.to_string_lossy().to_string();

        // Check skipped status
        if already_indexed.contains(&path_str) {
            skipped += 1;
            let _ = app.emit("indexing-progress", IndexProgress {
                current, total, file_name,
                status: "skipped".to_string(),
                message: "already indexed".to_string(),
            });
            continue;
        }

        let _ = app.emit("indexing-progress", IndexProgress {
            current, total, file_name: file_name.clone(),
            status: "processing".to_string(),
            message: "indexing...".to_string(),
        });

        match index_file_core(&db_path, &provider, path, &options, reindex).await {
            Ok(msg) => {
                indexed += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "ok".to_string(),
                    message: msg,
                });
            }
            Err(e) => {
                if e == "Indexing stopped by user" {
                    if let Some(ref conn) = db_conn {
                        let session = store::IndexingSession {
                            path: folder_path.clone(),
                            is_folder: true,
                            reindex,
                            start_index: i,
                            total_files: total,
                            status: "stopped".to_string(),
                            updated_at: chrono::Local::now().to_rfc3339(),
                        };
                        let _ = store::save_indexing_session(conn, &session);
                    }
                    let _ = app.emit("indexing-progress", IndexProgress {
                        current,
                        total,
                        file_name: "".to_string(),
                        status: "failed".to_string(),
                        message: "Indexing stopped by user".to_string(),
                    });
                    break;
                }
                failed += 1;
                let _ = app.emit("indexing-progress", IndexProgress {
                    current, total, file_name,
                    status: "failed".to_string(),
                    message: e,
                });
            }
        }
    }

    let stopped = SHOULD_STOP_INDEXING.load(Ordering::SeqCst);
    if stopped {
        return Err("Indexing stopped by user".to_string());
    }

    if let Some(ref conn) = db_conn {
        let _ = store::delete_indexing_session(conn, &folder_path);
    }

    Ok(IndexSummary { indexed, skipped, failed })
}
