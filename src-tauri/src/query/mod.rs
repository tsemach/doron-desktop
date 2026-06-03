mod types;
mod helpers;
mod queries;
mod llm;

pub use types::DocumentRow;
use tauri::AppHandle;
use crate::store;

#[tauri::command]
pub async fn search_documents(
    app: AppHandle,
    query: String,
    api_key: String,
    limit: Option<usize>,
    model: Option<String>,
) -> Result<Vec<DocumentRow>, String> {
    let model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let limit = limit.unwrap_or(10);

    let analysis = llm::analyze_query(&query, &api_key, &model).await?;

    let conn = store::open_db(&app)?;
    let local_results = queries::execute_smart_query(&conn, &analysis, &query, limit * 2);

    // Rerank candidates using Claude to discard generic boilerplate matches
    llm::rerank_candidates(&query, local_results, &api_key, &model).await
}

#[cfg(test)]
mod tests {
    use super::*;
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
