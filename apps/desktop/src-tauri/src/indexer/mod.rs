use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static SHOULD_STOP_INDEXING: AtomicBool = AtomicBool::new(false);

// Matches query/mod.rs::USE_FTS_ONLY's precedent -- a hardcoded,
// developer-flippable constant, not a settings-UI toggle. Default true
// (heuristic-only) keeps indexing free of any LLM cost, including cost
// through the backend proxy, until deliberately flipped.
pub const USE_HEURISTIC_METADATA_ONLY: bool = true;


/// Link a freshly indexed document to the case whose folder contains it.
///
/// Best-effort: failing to derive a case must not fail indexing. `None` is the normal
/// outcome for scan-and-index over folders that are not case folders.
fn assign_case_for_indexed_document(conn: &rusqlite::Connection, doc_id: Option<i64>) {
    let Some(id) = doc_id else { return };
    if let Err(e) = crate::case::documents_link::assign_document_case(conn, id) {
        eprintln!("[case matcher] could not assign case for document {id}: {e}");
    }
}

/// Index a file that has just been placed in a case folder, in the background.
///
/// Indexing is what makes a document searchable *and* what links it to its case, via
/// `assign_case_for_indexed_document`. A file copied into a case folder without it appears
/// in the folder listing and nowhere else: not in search, and invisible to the email
/// matcher's Tier B, which reads `documents_fts` joined on `documents.case_id`. Measured on
/// a real profile, 140 of 225 documents had no case for exactly this reason.
///
/// Spawned rather than awaited: extraction plus embeddings takes seconds and must not hold
/// the dialog open. Failure is logged, never surfaced — the file is already safely copied,
/// and a later scan-and-index will pick it up.
pub fn index_case_file_in_background(app: &AppHandle, file_path: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = index_file(app, file_path.clone(), None, Some(false)).await {
            eprintln!("[indexer] could not index case document {file_path}: {e}");
        }
    });
}

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
    
    let normalized = path.replace("\\", "/");
    let clean_path = if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let drive = &normalized[..2].to_lowercase();
        if drive == "u:" {
            normalized[2..].to_string()
        } else {
            normalized
        }
    } else {
        normalized
    };

    store::delete_indexing_session(&conn, &clean_path).map_err(|e| e.to_string())
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

#[derive(Serialize, Clone)]
pub struct IndexSummary {
    pub indexed: usize,
    pub skipped: usize,
    pub failed: usize,
}

#[derive(Serialize, Clone)]
pub struct IndexingFinished {
    pub path: String,
    pub is_folder: bool,
    pub summary: Option<IndexSummary>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
struct IndexingStarted {
    path: String,
    is_folder: bool,
}

fn emit_indexing_started(app: &AppHandle, path: &str, is_folder: bool) {
    let _ = app.emit(
        "indexing-started",
        IndexingStarted {
            path: path.to_string(),
            is_folder,
        },
    );
}

fn emit_indexing_finished(app: &AppHandle, path: &str, is_folder: bool, result: &Result<IndexSummary, String>) {
    let (summary, error) = match result {
        Ok(summary) => (Some(summary.clone()), None),
        Err(message) => (None, Some(message.clone())),
    };
    let _ = app.emit(
        "indexing-finished",
        IndexingFinished {
            path: path.to_string(),
            is_folder,
            summary,
            error,
        },
    );
}

pub fn pick_latest_active_session(sessions: &[store::IndexingSession]) -> Option<store::IndexingSession> {
    let mut active: Vec<_> = sessions
        .iter()
        .filter(|session| session.total_files == 0 || session.start_index < session.total_files)
        .cloned()
        .collect();
    if active.is_empty() {
        return None;
    }
    active.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    active.into_iter().next()
}

pub async fn resume_interrupted_indexing(app: AppHandle) {
    let db_path = store::db_path(&app);
    let conn = match store::open_db_by_path(&db_path) {
        Ok(conn) => conn,
        Err(err) => {
            eprintln!("[indexer] Failed to open DB for resume check: {err}");
            return;
        }
    };

    let sessions = match store::get_active_indexing_sessions(&conn) {
        Ok(sessions) => sessions,
        Err(err) => {
            eprintln!("[indexer] Failed to load active indexing sessions: {err}");
            return;
        }
    };

    let Some(session) = pick_latest_active_session(&sessions) else {
        return;
    };

    println!("[indexer] Resuming interrupted indexing session: {session:?}");

    if session.is_folder {
        let _ = index_folder(
            app,
            session.path,
            None,
            Some(session.reindex),
            Some(session.start_index),
        )
        .await;
    } else {
        let _ = index_file(app, session.path, None, Some(session.reindex)).await;
    }
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
        let msg = if ext == "pdf" {
            "no text extracted (PDF may be scanned/image-only)"
        } else {
            "no text extracted"
        };
        return Err(msg.to_string());
    }

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let doc_id_opt;

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
        assign_case_for_indexed_document(&conn, doc_id_opt);
    } else {
        // Heuristic metadata path (free tier / local mode) — also runs on reindex.
        // Previously gated on doc_id_opt.is_none(), which skipped DB updates when
        // force-reindexing an already-indexed document.
        let file_size_kb = std::fs::metadata(file_path).map(|m| m.len() as i64 / 1024).unwrap_or(0);
        let metadata = extractor::metadata::extract_heuristic_metadata(&extracted.text, &file_name, &ext);
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
        store::insert_document(&conn, &record).map_err(|e| format!("DB fallback insertion failed: {e}"))?;
        doc_id_opt = store::get_document_id_by_path(&conn, &path_str).map_err(|e| e.to_string())?;
        assign_case_for_indexed_document(&conn, doc_id_opt);
    }

    let doc_id = doc_id_opt.ok_or_else(|| "Failed to retrieve document ID".to_string())?;

    if SHOULD_STOP_INDEXING.load(Ordering::SeqCst) {
        return Err("Indexing stopped by user".to_string());
    }

    // Track 2: Vector Embeddings generation
    if options.run_vector_embeddings && !crate::query::USE_FTS_ONLY {
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

    let status_str = match (options.run_llm_metadata, options.run_vector_embeddings && !crate::query::USE_FTS_ONLY) {
        (true, true) => "Indexed with LLM metadata and vector chunks",
        (true, false) => "Indexed with LLM metadata only",
        (false, true) => "Indexed with heuristic metadata and vector chunks",
        (false, false) => "Indexed with heuristic metadata",
    };

    Ok(format!("{status_str} for {file_name}"))
}

#[tauri::command]
pub async fn index_file(
    app: AppHandle,
    file_path: String,
    model: Option<String>,
    reindex: Option<bool>,
) -> Result<IndexSummary, String> {
    emit_indexing_started(&app, &file_path, false);
    let result = index_file_inner(app.clone(), file_path.clone(), model, reindex).await;
    emit_indexing_finished(&app, &file_path, false, &result);
    result
}

async fn index_file_inner(
    app: AppHandle,
    file_path: String,
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
    let provider = crate::llm::load_active_provider(&app, String::new(), Some(model), "doc_indexing")?;

    // Free tier falls back to extract_heuristic_metadata below -- indexing
    // itself stays free (PRD 5.5), only the LLM-based extraction step is
    // Pro-gated (PLAN.md Phase 3).
    let options = IndexOptions {
        run_llm_metadata: !USE_HEURISTIC_METADATA_ONLY && crate::auth::is_pro_tier(&app),
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
    model: Option<String>,
    reindex: Option<bool>,
    start_index: Option<usize>,
) -> Result<IndexSummary, String> {
    emit_indexing_started(&app, &folder_path, true);
    let result = index_folder_inner(app.clone(), folder_path.clone(), model, reindex, start_index).await;
    emit_indexing_finished(&app, &folder_path, true, &result);
    result
}

async fn index_folder_inner(
    app: AppHandle,
    folder_path: String,
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
    let provider = crate::llm::load_active_provider(&app, String::new(), Some(model), "doc_indexing")?;

    // Free tier falls back to extract_heuristic_metadata below -- indexing
    // itself stays free (PRD 5.5), only the LLM-based extraction step is
    // Pro-gated (PLAN.md Phase 3).
    let options = IndexOptions {
        run_llm_metadata: !USE_HEURISTIC_METADATA_ONLY && crate::auth::is_pro_tier(&app),
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
