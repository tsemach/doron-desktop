use std::collections::HashSet;
use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    query::query_by_fts,
    store,
};
use super::common::setup_test_db;

fn insert_test_doc(
    conn: &Connection,
    path: &str,
    title: &str,
    text: &str,
    keywords: &str,
) -> i64 {
    let record = store::DocumentRecord {
        file_path: path.to_string(),
        file_name: path.to_string(),
        file_ext: "txt".to_string(),
        file_size_kb: 1,
        doc_type: Some("document".to_string()),
        title: Some(title.to_string()),
        summary: Some("Test summary".to_string()),
        authors: "[]".to_string(),
        doc_date: None,
        topics: "[]".to_string(),
        entities: "[]".to_string(),
        keywords: keywords.to_string(),
        language: Some("en".to_string()),
        page_count: Some(1),
        confidence: None,
        raw_metadata: "{}".to_string(),
        raw_text: text.to_string(),
    };
    store::insert_document(conn, &record).expect("Should insert test document");
    store::get_document_id_by_path(conn, path)
        .expect("Should fetch doc id")
        .expect("Doc id must exist")
}

#[test]
fn test_query_by_fts_basic() {
    let db_path = Path::new("tests/query/query_fts_basic_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_rental = insert_test_doc(
        &conn,
        "rental.txt",
        "Rental Contract",
        "This is a rental lease agreement for an apartment in Tel Aviv.",
        "[\"rental\", \"lease\", \"apartment\"]",
    );

    let doc_id_medical = insert_test_doc(
        &conn,
        "medical.txt",
        "Medical Report",
        "Medical report detailing clinical patient diagnostics and therapy.",
        "[\"medical\", \"patient\", \"therapy\"]",
    );

    // Query for rental keywords
    let keywords = vec!["rental".to_string(), "lease".to_string()];
    let results = query_by_fts(&conn, Some(&keywords), None, 5);

    assert!(results.contains_key(&doc_id_rental), "Should find rental contract");
    assert!(!results.contains_key(&doc_id_medical), "Should not find medical report");
    assert!(*results.get(&doc_id_rental).unwrap() > 0.0, "Score should be positive");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_by_fts_and_or_fallback() {
    let db_path = Path::new("tests/query/query_fts_fallback_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_1 = insert_test_doc(
        &conn,
        "doc1.txt",
        "Doc 1",
        "Blue skies and sunny days.",
        "[\"blue\", \"skies\", \"sunny\"]",
    );

    let doc_id_2 = insert_test_doc(
        &conn,
        "doc2.txt",
        "Doc 2",
        "Rainy days and cloudy skies.",
        "[\"rainy\", \"days\", \"cloudy\"]",
    );

    // 1. AND match: keywords "skies" and "sunny" are both in doc1, but only "skies" is in doc2.
    // The query should use the AND expression first and only return doc1.
    let keywords_and = vec!["skies".to_string(), "sunny".to_string()];
    let results_and = query_by_fts(&conn, Some(&keywords_and), None, 5);
    assert!(results_and.contains_key(&doc_id_1), "Should match doc1");
    assert!(!results_and.contains_key(&doc_id_2), "Should not match doc2 (AND failed for doc2)");

    // 2. OR fallback: keywords "sunny" and "cloudy" are in different documents.
    // AND will return empty, falling back to OR which returns both documents.
    let keywords_or = vec!["sunny".to_string(), "cloudy".to_string()];
    let results_or = query_by_fts(&conn, Some(&keywords_or), None, 5);
    assert!(results_or.contains_key(&doc_id_1), "Should match doc1 (fallback OR)");
    assert!(results_or.contains_key(&doc_id_2), "Should match doc2 (fallback OR)");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_by_fts_filtering() {
    let db_path = Path::new("tests/query/query_fts_filtering_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_1 = insert_test_doc(
        &conn,
        "doc1.txt",
        "Doc 1",
        "Alpha beta gamma",
        "[\"alpha\", \"beta\"]",
    );

    let doc_id_2 = insert_test_doc(
        &conn,
        "doc2.txt",
        "Doc 2",
        "Alpha beta epsilon",
        "[\"alpha\", \"beta\"]",
    );

    // Query for "Alpha" but filter for only doc_id_2
    let keywords = vec!["Alpha".to_string()];
    let mut filters = HashSet::new();
    filters.insert(doc_id_2);

    let results = query_by_fts(&conn, Some(&keywords), Some(&filters), 5);
    assert!(!results.contains_key(&doc_id_1), "Doc 1 should be filtered out");
    assert!(results.contains_key(&doc_id_2), "Doc 2 should be returned");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_by_fts_empty_or_none() {
    let db_path = Path::new("tests/query/query_fts_empty_test.db");
    let conn = setup_test_db(db_path);

    // Querying with None keywords
    let results_none = query_by_fts(&conn, None, None, 5);
    assert!(results_none.is_empty(), "Results with None keywords should be empty");

    // Querying with empty keywords list
    let empty_keywords = vec![];
    let results_empty = query_by_fts(&conn, Some(&empty_keywords), None, 5);
    assert!(results_empty.is_empty(), "Results with empty keywords list should be empty");

    let _ = std::fs::remove_file(db_path);
}
