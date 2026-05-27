use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::{extractor, llm, store};

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

#[tauri::command]
pub async fn index_folder(
    app: AppHandle,
    folder_path: String,
    api_key: String,
    model: Option<String>,
    reindex: Option<bool>,
) -> Result<IndexSummary, String> {
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let reindex = reindex.unwrap_or(false);

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

    for (i, path) in files.iter().enumerate() {
        let current = i + 1;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let path_str = path.to_string_lossy().to_string();

        let _ = app.emit("indexing-progress", IndexProgress {
            current, total, file_name: file_name.clone(),
            status: "processing".to_string(),
            message: "scanning...".to_string(),
        });

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
            raw_text: extracted.text.clone(),
        };

        // insert — fresh conn after the await
        let conn = store::open_db(&app)?;
        match store::insert_document(&conn, &record) {
            Ok(_) => {
                // Generate and save chunk embeddings
                if let Ok(Some(doc_id)) = store::get_document_id_by_path(&conn, &record.file_path) {
                    let chunks = crate::embeddings::chunk_text(&extracted.text, 1000, 200);
                    if !chunks.is_empty() {
                        if let Ok(embeddings) = crate::embeddings::get_passage_embeddings(&chunks) {
                            for (idx, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                                let emb_bytes = crate::embeddings::vec_to_bytes(emb);
                                let _ = store::insert_document_chunk(&conn, doc_id, idx as i32, chunk, &emb_bytes);
                            }
                        }
                    }
                }
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

    // skip check
    if !reindex {
        let conn = store::open_db(&app)?;
        if store::is_already_indexed(&conn, &file_path).map_err(|e| e.to_string())? {
            emit_progress("skipped", "already indexed");
            return Ok(IndexSummary { indexed: 0, skipped: 1, failed: 0 });
        }
    }

    // extract text
    emit_progress("processing", "extracting text...");
    let extracted = match extractor::extract(path) {
        Ok(e) if !e.text.trim().is_empty() => e,
        Ok(_) => {
            emit_progress("skipped", "no text extracted");
            return Ok(IndexSummary { indexed: 0, skipped: 1, failed: 0 });
        }
        Err(e) => {
            emit_progress("failed", &format!("extraction failed: {e}"));
            return Ok(IndexSummary { indexed: 0, skipped: 0, failed: 1 });
        }
    };

    // call Claude
    emit_progress("processing", "analyzing with AI...");
    let metadata = match llm::call_claude(&extracted.text, &api_key, &model).await {
        Ok(m) => m,
        Err(e) => {
            emit_progress("failed", &format!("API error: {e}"));
            return Ok(IndexSummary { indexed: 0, skipped: 0, failed: 1 });
        }
    };

    // build record
    let file_size_kb = std::fs::metadata(path).map(|m| m.len() as i64 / 1024).unwrap_or(0);
    let raw_metadata = serde_json::to_string(&metadata).unwrap_or_default();
    let msg = format!(
        "[{}] {}",
        metadata.doc_type.as_deref().unwrap_or("?"),
        metadata.title.as_deref().unwrap_or("(no title)")
    );

    let record = store::DocumentRecord {
        file_path: file_path.clone(),
        file_name: file_name.clone(),
        file_ext: ext,
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
        raw_text: extracted.text.clone(),
    };

    let conn = store::open_db(&app)?;
    match store::insert_document(&conn, &record) {
        Ok(_) => {
            // Generate and save chunk embeddings
            if let Ok(Some(doc_id)) = store::get_document_id_by_path(&conn, &record.file_path) {
                let chunks = crate::embeddings::chunk_text(&extracted.text, 1000, 200);
                if !chunks.is_empty() {
                    if let Ok(embeddings) = crate::embeddings::get_passage_embeddings(&chunks) {
                        for (idx, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                            let emb_bytes = crate::embeddings::vec_to_bytes(emb);
                            let _ = store::insert_document_chunk(&conn, doc_id, idx as i32, chunk, &emb_bytes);
                        }
                    }
                }
            }
            emit_progress("ok", &msg);
            Ok(IndexSummary { indexed: 1, skipped: 0, failed: 0 })
        }
        Err(e) => {
            emit_progress("failed", &format!("DB error: {e}"));
            Ok(IndexSummary { indexed: 0, skipped: 0, failed: 1 })
        }
    }
}
