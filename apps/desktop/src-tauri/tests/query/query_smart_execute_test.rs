use std::path::Path;
use rusqlite::{Connection, params};
use tauri_app_lib::{
    query::{query_smart_execute, QueryAnalysis, DateRange, TagFilter},
    store,
    embeddings::{get_passage_embeddings, vec_to_bytes},
};
use super::common::{setup_test_db, start_llama_server_test, call_with_retry};
use tauri_app_lib::llm::llm_provider::{get_active_provider, ProviderConfig};
use tauri_app_lib::query::llm::query_llm_analyze_query;

fn insert_test_doc_with_details(
    conn: &Connection,
    path: &str,
    title: &str,
    text: &str,
    doc_type: Option<&str>,
    doc_date: Option<&str>,
    keywords: &str,
) -> i64 {
    let record = store::DocumentRecord {
        file_path: path.to_string(),
        file_name: path.to_string(),
        file_ext: "txt".to_string(),
        file_size_kb: 1,
        doc_type: doc_type.map(|s| s.to_string()),
        title: Some(title.to_string()),
        summary: Some("Test summary".to_string()),
        authors: "[]".to_string(),
        doc_date: doc_date.map(|s| s.to_string()),
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

/// `common::setup_test_db` only initializes the documents/FTS/chunks schema.
/// Tag/notes filter tests also need the `tags` and `document_annotations`
/// tables, which live in `store::open_db_by_path`'s full schema init.
fn setup_full_test_db(db_path: &Path) -> Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    store::open_db_by_path(db_path).expect("Should open full-schema test db")
}

fn insert_test_document_tag(conn: &Connection, file_path: &str, name: &str, value: Option<&str>) {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO tags (scope_type, scope_value, name, value, type, created_at, updated_at)
         VALUES ('document', ?1, ?2, ?3, 'user', ?4, ?4)",
        params![file_path, name, value, now],
    ).expect("Should insert test tag");
}

fn insert_test_document_notes(conn: &Connection, file_path: &str, notes: &str) {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO document_annotations (file_path, notes, updated_at) VALUES (?1, ?2, ?3)",
        params![file_path, notes, now],
    ).expect("Should insert test notes");
}

#[test]
fn test_query_smart_execute_basic_fts() {
    let db_path = Path::new("tests/query/query_smart_basic_fts_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_rental = insert_test_doc_with_details(
        &conn,
        "rental_contract.txt",
        "Rental Lease Contract",
        "This is an apartment rental lease agreement.",
        Some("contract"),
        None,
        "[\"rental\", \"lease\", \"agreement\"]",
    );

    let doc_id_medical = insert_test_doc_with_details(
        &conn,
        "medical_report.txt",
        "Medical Clinical Report",
        "Patient clinical diagnostic test details.",
        Some("report"),
        None,
        "[\"medical\", \"clinical\", \"diagnostic\"]",
    );

    // Formulate keywords-only query analysis without embeddings (FTS only)
    let analysis = QueryAnalysis {
        keywords: Some(vec!["rental".to_string(), "lease".to_string()]),
        entities: None,
        doc_types: None,
        date_range: None,
        summary_importance: None,
    };

    let results = query_smart_execute(&conn, &analysis, "rental lease contract", None, None, 5);

    assert!(!results.is_empty(), "Results should not be empty");
    let returned_ids: Vec<i64> = results.iter().map(|d| d.id).collect();
    assert!(returned_ids.contains(&doc_id_rental), "Should return rental contract");
    assert!(!returned_ids.contains(&doc_id_medical), "Should not return medical report");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_smart_execute_resilient_fallback() {
    let db_path = Path::new("tests/query/query_smart_fallback_test.db");
    let conn = setup_test_db(db_path);

    let doc_id = insert_test_doc_with_details(
        &conn,
        "doc_2024.txt",
        "Document 2024",
        "Important report on project status.",
        Some("report"),
        Some("2024-05-15"),
        "[\"project\", \"status\"]",
    );

    // Query analysis specifies 2025 date range (which yields 0 filtered documents from DB)
    let analysis = QueryAnalysis {
        keywords: Some(vec!["project".to_string()]),
        entities: None,
        doc_types: None,
        date_range: Some(DateRange {
            from: Some("2025-01-01".to_string()),
            to: Some("2025-12-31".to_string()),
        }),
        summary_importance: None,
    };

    // query_smart_execute should see date filter matches 0 documents and fallback to searching all documents
    let results = query_smart_execute(&conn, &analysis, "project status", None, None, 5);

    assert!(!results.is_empty(), "Should fallback and return the matching document");
    assert_eq!(results[0].id, doc_id, "Should find the document ID");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_smart_execute_tag_and_notes_filters() {
    let db_path = Path::new("tests/query/query_smart_tag_filter_test.db");
    let conn = setup_full_test_db(db_path);

    let doc_id_important = insert_test_doc_with_details(
        &conn,
        "important_report.txt",
        "Important Report",
        "Quarterly project status update.",
        Some("report"),
        None,
        "[\"project\", \"status\"]",
    );

    let doc_id_other = insert_test_doc_with_details(
        &conn,
        "other_report.txt",
        "Other Report",
        "Another quarterly project status update.",
        Some("report"),
        None,
        "[\"project\", \"status\"]",
    );

    insert_test_document_tag(&conn, "important_report.txt", "important", None);
    insert_test_document_tag(&conn, "important_report.txt", "priority", Some("high"));
    insert_test_document_notes(&conn, "important_report.txt", "Needs partner sign-off before Friday.");

    let analysis = QueryAnalysis {
        keywords: Some(vec!["project".to_string(), "status".to_string()]),
        entities: None,
        doc_types: None,
        date_range: None,
        summary_importance: None,
    };

    // Tag name only (no value) should match by presence.
    let by_tag_name = query_smart_execute(
        &conn,
        &analysis,
        "project status",
        Some(&[TagFilter { name: "important".to_string(), value: None }]),
        None,
        5,
    );
    let tag_name_ids: Vec<i64> = by_tag_name.iter().map(|d| d.id).collect();
    assert!(tag_name_ids.contains(&doc_id_important), "Tag filter should include the tagged document");
    assert!(!tag_name_ids.contains(&doc_id_other), "Tag filter should exclude the untagged document");

    // Multiple tags are intersected (AND) — document needs both.
    let by_both_tags = query_smart_execute(
        &conn,
        &analysis,
        "project status",
        Some(&[
            TagFilter { name: "important".to_string(), value: None },
            TagFilter { name: "priority".to_string(), value: Some("high".to_string()) },
        ]),
        None,
        5,
    );
    assert_eq!(by_both_tags.len(), 1, "Intersected tag filters should still return the matching document");
    assert_eq!(by_both_tags[0].id, doc_id_important);

    // Tag value mismatch should exclude the document.
    let by_wrong_value = query_smart_execute(
        &conn,
        &analysis,
        "project status",
        Some(&[TagFilter { name: "priority".to_string(), value: Some("low".to_string()) }]),
        None,
        5,
    );
    assert!(by_wrong_value.is_empty(), "Tag filter with a non-matching value should return no results, not fall back");

    // Notes-contains filter.
    let by_notes = query_smart_execute(&conn, &analysis, "project status", None, Some("sign-off"), 5);
    let notes_ids: Vec<i64> = by_notes.iter().map(|d| d.id).collect();
    assert!(notes_ids.contains(&doc_id_important), "Notes filter should include the matching document");
    assert!(!notes_ids.contains(&doc_id_other), "Notes filter should exclude documents without matching notes");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_smart_execute_explicit_filter_no_fallback() {
    let db_path = Path::new("tests/query/query_smart_tag_no_fallback_test.db");
    let conn = setup_full_test_db(db_path);

    insert_test_doc_with_details(
        &conn,
        "doc.txt",
        "Some Document",
        "Quarterly project status update.",
        Some("report"),
        None,
        "[\"project\", \"status\"]",
    );

    let analysis = QueryAnalysis {
        keywords: Some(vec!["project".to_string()]),
        entities: None,
        doc_types: None,
        date_range: None,
        summary_importance: None,
    };

    // No document has this tag — unlike the date-range fallback case, an
    // explicit tag filter matching 0 documents must NOT fall back to an
    // unfiltered search.
    let results = query_smart_execute(
        &conn,
        &analysis,
        "project",
        Some(&[TagFilter { name: "nonexistent".to_string(), value: None }]),
        None,
        5,
    );
    assert!(results.is_empty(), "Explicit tag filter with 0 matches should return no results, not fall back");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_smart_execute_with_vector() {
    let db_path = Path::new("tests/query/query_smart_vector_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_rental = insert_test_doc_with_details(
        &conn,
        "rental_contract.txt",
        "Rental Lease Contract",
        "This is an apartment rental lease agreement.",
        Some("contract"),
        None,
        "[\"rental\", \"lease\", \"agreement\"]",
    );

    let doc_id_medical = insert_test_doc_with_details(
        &conn,
        "medical_report.txt",
        "Medical Clinical Report",
        "Patient clinical diagnostic test details.",
        Some("report"),
        None,
        "[\"medical\", \"clinical\", \"diagnostic\"]",
    );

    let passages = vec![
        "This is an apartment rental lease agreement.".to_string(),
        "Patient clinical diagnostic test details.".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate embeddings");

    insert_test_chunk(&conn, doc_id_rental, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_medical, 0, &passages[1], &embeddings[1]);

    // Query analysis specifies doc_type overlap and keywords matching rental
    let analysis = QueryAnalysis {
        keywords: Some(vec!["rental".to_string()]),
        entities: None,
        doc_types: Some(serde_json::json!("contract")),
        date_range: None,
        summary_importance: None,
    };

    let results = query_smart_execute(&conn, &analysis, "apartment lease rental", None, None, 5);

    assert!(!results.is_empty(), "Results should not be empty");
    assert_eq!(results[0].id, doc_id_rental, "Rental contract should be returned first");

    let _ = std::fs::remove_file(db_path);
}

#[test]
fn test_query_smart_execute_thresholding() {
    let db_path = Path::new("tests/query/query_smart_threshold_test.db");
    let conn = setup_test_db(db_path);

    // Insert 3 documents
    let doc_id_1 = insert_test_doc_with_details(
        &conn,
        "doc1.txt",
        "Best Match",
        "This is exactly what the user is looking for.",
        Some("document"),
        None,
        "[\"best\", \"exact\"]",
    );

    let doc_id_2 = insert_test_doc_with_details(
        &conn,
        "doc2.txt",
        "Medium Match",
        "This is moderately related to the user's query.",
        Some("document"),
        None,
        "[\"medium\", \"moderate\"]",
    );

    let doc_id_3 = insert_test_doc_with_details(
        &conn,
        "doc3.txt",
        "Poor Match",
        "Completely irrelevant content and unrelated terms.",
        Some("document"),
        None,
        "[\"poor\", \"irrelevant\"]",
    );

    let passages = vec![
        "This is exactly what the user is looking for. Best match and exact query terms.".to_string(),
        "This is somewhat related. Moderate match, maybe helpful query info.".to_string(),
        "Completely unrelated. Bananas, apple pie, solar flares, abstract paintings.".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate passage embeddings");

    insert_test_chunk(&conn, doc_id_1, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_2, 0, &passages[1], &embeddings[1]);
    insert_test_chunk(&conn, doc_id_3, 0, &passages[2], &embeddings[2]);

    let analysis = QueryAnalysis {
        keywords: Some(vec!["best".to_string(), "exact".to_string()]),
        entities: None,
        doc_types: None,
        date_range: None,
        summary_importance: None,
    };

    let results = query_smart_execute(&conn, &analysis, "best exact query", None, None, 5);

    assert!(!results.is_empty(), "Results should not be empty");
    let returned_ids: Vec<i64> = results.iter().map(|d| d.id).collect();
    
    // doc_id_1 should definitely be returned
    assert!(returned_ids.contains(&doc_id_1), "Should contain the best match");
    // doc_id_3 should be excluded because its vector score is far below doc_id_1's score and it lacks matching keywords,
    // placing it below the top_score - 0.15 threshold.
    assert!(!returned_ids.contains(&doc_id_3), "Should exclude the poor match via relative thresholding");

    let _ = std::fs::remove_file(db_path);
}

#[tokio::test]
async fn test_query_smart_execute_phi() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10131;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping test_query_smart_execute_phi: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    let db_path = Path::new("tests/query/query_smart_phi_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_rental = insert_test_doc_with_details(
        &conn,
        "rental_agreement.txt",
        "Rental Agreement",
        "הסכם שכירות של אלי נחמיאס משנת 2023 עבור דירה ברחוב דיזנגוף תל אביב.",
        Some("contract"),
        Some("2023-08-12"),
        "[\"חוזה\", \"שכירות\", \"אלי נחמיאס\"]",
    );

    let doc_id_medical = insert_test_doc_with_details(
        &conn,
        "medical_report.txt",
        "Medical Diagnosis Report",
        "Medical evaluation report from clinic post operation.",
        Some("report"),
        Some("2022-04-10"),
        "[\"רפואי\", \"אבחנה\"]",
    );

    // Add embeddings to make it a vector hybrid query
    let passages = vec![
        "הסכם שכירות של אלי נחמיאס משנת 2023 עבור דירה ברחוב דיזנגוף תל אביב.".to_string(),
        "Medical evaluation report from clinic post operation.".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate passage embeddings");
    insert_test_chunk(&conn, doc_id_rental, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_medical, 0, &passages[1], &embeddings[1]);

    let query = "מצא חוזה שכירות של אלי נחמיאס משנת 2023";
    let analysis = call_with_retry(|| async {
        query_llm_analyze_query(query, &provider).await
    })
    .await
    .expect("Query analysis via phi should succeed");

    println!("Phi generated analysis: {:?}", analysis);

    // Call query_smart_execute with the LLM analysis and the query text
    let results = query_smart_execute(&conn, &analysis, query, None, None, 5);

    assert!(!results.is_empty(), "Results should contain matches");
    assert_eq!(results[0].id, doc_id_rental, "Should match and rank the rental agreement first");

    let _ = std::fs::remove_file(db_path);
}

#[tokio::test]
async fn test_query_smart_execute_qwen() {
    let model_name = "qwen-2.5-3b-instruct (q4)";
    let port = 10132;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping test_query_smart_execute_qwen: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    let db_path = Path::new("tests/query/query_smart_qwen_test.db");
    let conn = setup_test_db(db_path);

    let doc_id_rental = insert_test_doc_with_details(
        &conn,
        "rental_agreement.txt",
        "Rental Agreement",
        "הסכם שכירות של אלי נחמיאס משנת 2023 עבור דירה ברחוב דיזנגוף תל אביב.",
        Some("contract"),
        Some("2023-08-12"),
        "[\"חוזה\", \"שכירות\", \"אלי נחמיאס\"]",
    );

    let doc_id_medical = insert_test_doc_with_details(
        &conn,
        "medical_report.txt",
        "Medical Diagnosis Report",
        "Medical evaluation report from clinic post operation.",
        Some("report"),
        Some("2022-04-10"),
        "[\"רפואי\", \"אבחנה\"]",
    );

    // Add embeddings to make it a vector hybrid query
    let passages = vec![
        "הסכם שכירות של אלי נחמיאס משנת 2023 עבור דירה ברחוב דיזנגוף תל אביב.".to_string(),
        "Medical evaluation report from clinic post operation.".to_string(),
    ];
    let embeddings = get_passage_embeddings(&passages).expect("Should generate passage embeddings");
    insert_test_chunk(&conn, doc_id_rental, 0, &passages[0], &embeddings[0]);
    insert_test_chunk(&conn, doc_id_medical, 0, &passages[1], &embeddings[1]);

    let query = "מצא חוזה שכירות של אלי נחמיאס משנת 2023";
    let analysis = call_with_retry(|| async {
        query_llm_analyze_query(query, &provider).await
    })
    .await
    .expect("Query analysis via qwen should succeed");

    println!("Qwen generated analysis: {:?}", analysis);

    // Call query_smart_execute with the LLM analysis and the query text
    let results = query_smart_execute(&conn, &analysis, query, None, None, 5);

    assert!(!results.is_empty(), "Results should contain matches");
    assert_eq!(results[0].id, doc_id_rental, "Should match and rank the rental agreement first");

    let _ = std::fs::remove_file(db_path);
}
