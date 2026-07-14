use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    query::{query_smart_execute, QueryAnalysis, DateRange},
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

    let results = query_smart_execute(&conn, &analysis, "rental lease contract", 5);

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
    let results = query_smart_execute(&conn, &analysis, "project status", 5);

    assert!(!results.is_empty(), "Should fallback and return the matching document");
    assert_eq!(results[0].id, doc_id, "Should find the document ID");

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

    let results = query_smart_execute(&conn, &analysis, "apartment lease rental", 5);

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

    let results = query_smart_execute(&conn, &analysis, "best exact query", 5);

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
    let results = query_smart_execute(&conn, &analysis, query, 5);

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
    let results = query_smart_execute(&conn, &analysis, query, 5);

    assert!(!results.is_empty(), "Results should contain matches");
    assert_eq!(results[0].id, doc_id_rental, "Should match and rank the rental agreement first");

    let _ = std::fs::remove_file(db_path);
}
