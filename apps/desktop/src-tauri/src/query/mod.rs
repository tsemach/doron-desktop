mod types;
mod helpers;
mod filters;
mod queries;
pub mod llm;

pub use types::{DocumentRow, SearchOptions, QueryAnalysis, DateRange, TagFilter};
pub use queries::query_by_vector;
pub use queries::query_by_fts;
pub use queries::query_smart_execute;
use tauri::AppHandle;
use crate::store;
use crate::llm::llm_provider::LlmProvider;
use std::path::Path;

pub const USE_FTS_ONLY: bool = true;

/// Core decoupled search dispatcher.
/// Executes query analysis, local FTS + Vector hybrid search, and LLM reranking.
pub async fn query_search_documents_core(
    db_path: &Path,
    provider: &LlmProvider,
    query: &str,
    limit: usize,
    options: &SearchOptions,
    tags: Option<&[TagFilter]>,
    notes_contains: Option<&str>,
) -> Result<Vec<DocumentRow>, String> {
    let analysis = if options.use_llm_query_analysis && !USE_FTS_ONLY {
        llm::query_llm_analyze_query(query, provider).await?
    } else {
        llm::analyze_query_heuristically(query)
    };

    // Re-opening the DB re-runs schema/DDL checks, and query_smart_execute is a
    // synchronous SQLite scan -- both run on the blocking pool so a search on
    // every keystroke doesn't stall every other in-flight command while it runs.
    let db_path_owned = db_path.to_path_buf();
    let query_owned = query.to_string();
    let tags_owned = tags.map(|t| t.to_vec());
    let notes_owned = notes_contains.map(|s| s.to_string());

    let local_results = crate::blocking::run_blocking(move || {
        let conn = store::open_db_by_path(&db_path_owned)?;
        Ok(queries::query_smart_execute(
            &conn,
            &analysis,
            &query_owned,
            tags_owned.as_deref(),
            notes_owned.as_deref(),
            limit * 2,
        ))
    }).await?;

    if options.use_llm_rerank && !USE_FTS_ONLY {
        llm::query_llm_rerank_candidates(query, local_results, provider).await
    } else {
        Ok(local_results)
    }
}

#[tauri::command]
pub async fn query_search_documents(
    app: AppHandle,
    query: String,
    _api_key: String, // TODO: remove — LLM config is backend-only
    limit: Option<usize>,
    model: Option<String>,
    tags: Option<Vec<TagFilter>>,
    notes_contains: Option<String>,
) -> Result<Vec<DocumentRow>, String> {
    let request = crate::search::SearchRequest {
        scope: crate::search::SearchScope::Documents,
        query,
        limit,
        filters: crate::search::SearchFilters {
            tags,
            notes_contains,
        },
    };
    let response = {
        use crate::search::SearchEngine;
        crate::search::DocumentSearchEngine::search(&app, request, model).await?
    };
    Ok(response.results)
}

#[cfg(test)]
mod tests { 
    use rusqlite::Connection;

    #[test]
    fn test_similarity_run() {
        let db_paths = [
            "/home/tsemach/.local/share/com.tsemach.doron-desktop/documents.db",
            "C:\\Users\\tsemach\\AppData\\Local\\com.tsemach.doron-desktop\\documents.db",
            "C:\\Users\\tsemach\\AppData\\Roaming\\com.tsemach.doron-desktop\\documents.db",
        ];
        
        let mut conn = None;
        for path in &db_paths {
            if std::path::Path::new(path).exists() {
                if let Ok(c) = Connection::open(path) {
                    conn = Some(c);
                    break;
                }
            }
        }
        
        let conn = match conn {
            Some(c) => c,
            None => {
                println!("Skipping test_similarity_run because test database was not found.");
                return;
            }
        };
        
        let query_text = "מצא חוזה שכירות מ-2024";
        let query_vec = crate::embeddings::embedding_by_query(query_text).unwrap();

        let mut stmt = conn.prepare("SELECT d.id, d.file_name, c.chunk_index, c.embedding FROM documents d JOIN document_chunks c ON d.id = c.document_id").unwrap();
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let file_name: String = row.get(1)?;
            let chunk_idx: i32 = row.get(2)?;
            let bytes: Vec<u8> = row.get(3)?;
            Ok((id, file_name, chunk_idx, bytes))
        }).unwrap();

        println!("\nSIMILARITY SCORES FOR QUERY: {}", query_text);
        for row in rows.flatten() {
            let (id, file_name, chunk_idx, bytes) = row;
            let chunk_vec = crate::embeddings::bytes_to_vec(&bytes);
            let similarity = crate::embeddings::cosine_similarity(&query_vec, &chunk_vec);
            println!("Doc ID {} ({}) - Chunk {}: similarity = {}", id, file_name, chunk_idx, similarity);
        }
    }
}

