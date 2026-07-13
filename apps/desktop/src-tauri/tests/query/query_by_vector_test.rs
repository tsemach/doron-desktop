use std::collections::HashSet;
use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    query::query_by_vector,
    store,
    embeddings::{get_passage_embeddings, vec_to_bytes},
};
use super::common::setup_test_db;

fn insert_test_doc(
    conn: &Connection,
    path: &str,
    title: &str,
    text: &str,
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
        keywords: "[]".to_string(),
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

fn insert_test_chunk(
    conn: &Connection,
    doc_id: i64,
    index: i32,
    text: &str,
    embedding: &[f32],
) {
    let bytes = vec_to_bytes(embedding);
    store::insert_document_chunk(conn, doc_id, index, text, &bytes).expect("Should insert chunk");
}

#[test]
fn test_query_by_vector_basic_ranking() {
    let db_path = Path::new("tests/query/query_embedding_basic_test.db");
    let conn = setup_test_db(db_path);

    // 1. Insert documents
    let doc_id_rental = insert_test_doc(
        &conn,
        "rental_contract.txt",
        "Rental Contract",
        "This is a lease agreement for an apartment in Tel Aviv rented to Eli Nahmias.",
    );

    let doc_id_medical = insert_test_doc(
        &conn,
        "medical_report.txt",
        "Medical Report",
        "The patient is experiencing severe back pain and was referred to physical therapy.",
    );

    // 2. Generate embeddings
    let passages = vec![
        "This is a lease agreement for an apartment in Tel Aviv rented to Eli Nahmias.".to_string(),
        "The patient is experiencing severe back pain and was referred to physical therapy.".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate passage embeddings");

    // 3. Insert chunks
    insert_test_chunk(&conn, doc_id_rental, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_medical, 0, &passages[1], &embeddings[1]);

    // 4. Query for rental contract
    let results = query_by_vector(&conn, "lease contract rented to Eli", None, 5);
    println!("Results rental contract: {:?}", results);
    assert!(!results.is_empty(), "Results should not be empty");
    assert_eq!(results[0].0, doc_id_rental, "Rental contract should be ranked first");
    assert!(results[0].1 > 0.6, "Rental similarity score should be high");

    // 5. Query for medical issue
    let results_med = query_by_vector(&conn, "patient severe back pain therapy", None, 5);
    println!("Results medical report: {:?}", results_med);
    assert!(!results_med.is_empty(), "Results should not be empty");
    assert_eq!(results_med[0].0, doc_id_medical, "Medical report should be ranked first");
    assert!(results_med[0].1 > 0.6, "Medical similarity score should be high");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_by_vector_with_id_filtering() {
    let db_path = Path::new("tests/query/query_embedding_filtering_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_rental = insert_test_doc(
        &conn,
        "rental_contract.txt",
        "Rental Contract",
        "This is a lease agreement for an apartment in Tel Aviv rented to Eli Nahmias.",
    );

    let doc_id_medical = insert_test_doc(
        &conn,
        "medical_report.txt",
        "Medical Report",
        "The patient is experiencing severe back pain and was referred to physical therapy.",
    );

    let passages = vec![
        "This is a lease agreement for an apartment in Tel Aviv rented to Eli Nahmias.".to_string(),
        "The patient is experiencing severe back pain and was referred to physical therapy.".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate passage embeddings");

    insert_test_chunk(&conn, doc_id_rental, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_medical, 0, &passages[1], &embeddings[1]);

    // Query for "rental contract" but FILTER ONLY for the medical report ID
    let mut filters = HashSet::new();
    filters.insert(doc_id_medical);

    let results = query_by_vector(&conn, "lease contract rented to Eli", Some(&filters), 5);
    assert!(!results.is_empty(), "Results should contain the filtered match");
    // Should only return the medical report because of ID filtering, despite the query being about rental contract
    assert_eq!(results.len(), 1, "Only 1 result should be returned due to filter");
    assert_eq!(results[0].0, doc_id_medical, "Only the medical report should be returned");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_by_vector_limit_truncation() {
    let db_path = Path::new("tests/query/query_embedding_limit_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_1 = insert_test_doc(&conn, "doc1.txt", "Doc 1", "Alpha beta gamma delta");
    let doc_id_2 = insert_test_doc(&conn, "doc2.txt", "Doc 2", "Alpha beta epsilon zeta");

    let passages = vec![
        "Alpha beta gamma delta".to_string(),
        "Alpha beta epsilon zeta".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate embeddings");

    insert_test_chunk(&conn, doc_id_1, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_2, 0, &passages[1], &embeddings[1]);

    // Query with limit 1
    let results_limit_1 = query_by_vector(&conn, "Alpha beta", None, 1);
    assert_eq!(results_limit_1.len(), 1, "Should truncate to 1 result");

    // Query with limit 2
    let results_limit_2 = query_by_vector(&conn, "Alpha beta", None, 2);
    assert_eq!(results_limit_2.len(), 2, "Should return 2 results");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_by_vector_empty_db() {
    let db_path = Path::new("tests/query/query_embedding_empty_test.db");
    let conn = setup_test_db(db_path);

    // Query empty database, should return empty vector cleanly
    let results = query_by_vector(&conn, "test query", None, 5);
    assert!(results.is_empty(), "Results on empty db should be empty");

    let _ = std::fs::remove_file(db_path);
}
