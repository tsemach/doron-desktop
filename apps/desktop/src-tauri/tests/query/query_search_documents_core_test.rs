use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    llm::llm_provider::{LlmProvider, MockProvider},
    query::{query_search_documents_core, SearchOptions},
    store,
};

fn insert_test_doc(conn: &Connection, path: &str, title: &str, text: &str) {
    let record = store::DocumentRecord {
        file_path: path.to_string(),
        file_name: path.to_string(),
        file_ext: "txt".to_string(),
        file_size_kb: 1,
        doc_type: Some("contract".to_string()),
        title: Some(title.to_string()),
        summary: Some("Test summary".to_string()),
        authors: "[]".to_string(),
        doc_date: None,
        topics: "[]".to_string(),
        entities: "[]".to_string(),
        keywords: "[]".to_string(),
        language: Some("en".to_string()),
        page_count: Some(1),
        confidence: None,
        raw_metadata: "{}".to_string(),
        raw_text: text.to_string(),
    };
    store::insert_document(conn, &record).expect("Should insert test document");
}

#[tokio::test]
async fn query_search_documents_core_finds_matching_document_via_fts() {
    let db_path = Path::new("tests/query/query_search_documents_core_test.db");
    if db_path.exists() {
        std::fs::remove_file(db_path).unwrap();
    }
    let conn = store::open_db_by_path(db_path).expect("Should open full-schema test db");

    insert_test_doc(
        &conn,
        "rental_contract.txt",
        "Rental Lease Contract",
        "This is an apartment rental lease agreement.",
    );
    insert_test_doc(
        &conn,
        "medical_report.txt",
        "Medical Clinical Report",
        "Patient clinical diagnostic test details.",
    );
    drop(conn);

    let provider = LlmProvider::Mock(MockProvider);
    let options = SearchOptions {
        use_llm_query_analysis: false,
        use_llm_rerank: false,
    };

    let results = query_search_documents_core(db_path, &provider, "rental lease contract", 5, &options, None, None)
        .await
        .expect("search should succeed");

    assert!(!results.is_empty(), "should find at least one matching document");
    assert!(
        results.iter().any(|d| d.file_name == "rental_contract.txt"),
        "should find the rental contract"
    );
    assert!(
        !results.iter().any(|d| d.file_name == "medical_report.txt"),
        "should not return the unrelated medical report"
    );

    let _ = std::fs::remove_file(db_path);
}
