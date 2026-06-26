use std::fs;
use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    indexer::{index_file_core, IndexOptions},
    query::{search_documents_core, DocumentRow},
    llm::llm_provider::{get_active_provider, LlmProvider, ProviderConfig},
    store,
};

#[tokio::test]
async fn test_decoupled_index_and_search_pipeline() {
    let db_path = Path::new("tests/decoupled_test.db");
    if db_path.exists() {
        let _ = fs::remove_file(db_path);
    }

    let conn = Connection::open(db_path).expect("Should open test db");
    store::init_documents_schema(&conn).expect("Schema init should succeed");

    // Write a temp file to index
    let temp_txt_path = Path::new("tests/docs/test_decoupled_doc.txt");
    fs::create_dir_all("tests/docs").ok();
    fs::write(
        temp_txt_path,
        "חוזה שכירות דירה ברחוב דיזנגוף 77 בתל אביב. שוכר: אלי נחמיאס. משכיר: יעל אוחנה.",
    )
    .expect("Should write temp text file");

    let provider: LlmProvider = get_active_provider(ProviderConfig {
        provider_type: "mock".to_string(),
        api_key: "".to_string(),
        model: "".to_string(),
        base_url: None,
    });

    // 1. Test indexing BOTH tracks (LLM metadata + Vector embeddings)
    let options_both = IndexOptions {
        run_llm_metadata: true,
        run_vector_embeddings: true,
    };
    let index_res = index_file_core(db_path, &provider, temp_txt_path, &options_both, true)
        .await
        .expect("Index core should succeed for both tracks");

    assert!(index_res.contains("Indexed with LLM metadata and vector chunks"));

    // Check if the document exists in db
    let doc_id = store::get_document_id_by_path(&conn, &temp_txt_path.to_string_lossy())
        .expect("Should query doc id")
        .expect("Doc should be indexed");

    // Verify chunk count
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?1").unwrap();
    let chunk_count: i64 = stmt.query_row([doc_id], |r| r.get(0)).unwrap();
    assert!(chunk_count > 0, "Vector chunks should have been generated");

    // 2. Test search document using the query core
    let search_results: Vec<DocumentRow> = search_documents_core(
        db_path,
        &provider,
        "מצא חוזה שכירות של אלי נחמיאס",
        5,
        true,
    )
    .await
    .expect("Search documents core should succeed");

    assert!(!search_results.is_empty(), "Should return search results");
    assert_eq!(search_results[0].id, doc_id);

    // 3. Test indexing ONLY the vector embeddings track (skipping LLM metadata)
    // Write another temp file
    let temp_txt_path_vector = Path::new("tests/docs/test_decoupled_vector_only.txt");
    fs::write(
        temp_txt_path_vector,
        "הסכם גירושין ופירוד משותף בין משה אברהם לבין מרים אברהם בירושלים.",
    )
    .expect("Should write temp text file for vector-only");

    let options_vector_only = IndexOptions {
        run_llm_metadata: false,
        run_vector_embeddings: true,
    };

    let index_res_vector = index_file_core(db_path, &provider, temp_txt_path_vector, &options_vector_only, true)
        .await
        .expect("Index core should succeed for vector-only track");

    assert!(index_res_vector.contains("Indexed with vector chunks only"));

    let doc_id_vector = store::get_document_id_by_path(&conn, &temp_txt_path_vector.to_string_lossy())
        .expect("Should query vector doc id")
        .expect("Vector doc should be indexed with skeletal entry");

    // Verify skeletal metadata title
    let mut stmt_doc = conn.prepare("SELECT title, summary FROM documents WHERE id = ?1").unwrap();
    let (title, summary): (Option<String>, Option<String>) = stmt_doc
        .query_row([doc_id_vector], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();

    assert_eq!(title, Some("test_decoupled_vector_only.txt".to_string()));
    assert!(summary.unwrap().contains("Skeletal document"));

    // Verify chunk count for vector only
    let chunk_count_vector: i64 = stmt.query_row([doc_id_vector], |r| r.get(0)).unwrap();
    assert!(chunk_count_vector > 0, "Vector chunks should have been generated for vector-only");

    // Cleanup temp files & db
    let _ = fs::remove_file(temp_txt_path);
    let _ = fs::remove_file(temp_txt_path_vector);
    let _ = fs::remove_file(db_path);
}
