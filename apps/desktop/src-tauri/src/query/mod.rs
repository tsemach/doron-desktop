mod types;
mod helpers;
mod queries;
mod llm;

pub use types::DocumentRow;
use tauri::AppHandle;
use crate::store;
use crate::llm::llm_provider::LlmProvider;

use std::path::Path;

/// Core decoupled search dispatcher.
/// Executes query analysis, local FTS + Vector hybrid search, and LLM reranking.
pub async fn search_documents_core(
    db_path: &Path,
    provider: &LlmProvider,
    query: &str,
    limit: usize,
    use_rerank: bool,
) -> Result<Vec<DocumentRow>, String> {
    let analysis = llm::analyze_query(query, provider).await?;

    let local_results = {
        let conn = store::open_db_by_path(db_path)?;
        queries::execute_smart_query(&conn, &analysis, query, limit * 2)
    };

    if use_rerank {
        llm::rerank_candidates(query, local_results, provider).await
    } else {
        Ok(local_results)
    }
}

#[tauri::command]
pub async fn search_documents(
    app: AppHandle,
    query: String,
    api_key: String,
    limit: Option<usize>,
    model: Option<String>,
) -> Result<Vec<DocumentRow>, String> {
    let limit = limit.unwrap_or(10);

    // Set up provider configuration
    let provider = crate::llm::load_active_provider(&app, api_key, model);

    let db_path = store::db_path(&app);
    search_documents_core(&db_path, &provider, &query, limit, true).await
}

#[cfg(test)]
mod tests { 
    use rusqlite::Connection;

    #[test]
    fn test_similarity_run() {
        let conn = Connection::open("/home/tsemach/.local/share/com.tsemach.doron-desktop/documents.db").unwrap();
        let query_text = "מצא חוזה שכירות מ-2024";
        let query_vec = crate::embeddings::get_query_embedding(query_text).unwrap();

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
