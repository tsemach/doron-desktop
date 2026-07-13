use std::fs;
use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    indexer::{index_file_core, IndexOptions},
    query::{query_search_documents_core, SearchOptions},
    llm::llm_provider::{get_active_provider, LlmProvider, ProviderConfig},
    store,
};

#[tokio::test]
async fn test_integration_document_search_flow() {
    let db_path = Path::new("tests/integration_test_tabu.db");
    if db_path.exists() {
        let _ = fs::remove_file(db_path);
    }

    let conn = Connection::open(db_path).expect("Should open integration test db");
    store::init_documents_schema(&conn).expect("Schema init should succeed");

    // Use Mock LLM Provider to avoid hitting rate limits or slow local sidecars
    let provider: LlmProvider = get_active_provider(ProviderConfig {
        provider_type: "mock".to_string(),
        api_key: "".to_string(),
        model: "".to_string(),
        base_url: None,
    });

    let index_options = IndexOptions {
        run_llm_metadata: true,
        run_vector_embeddings: true,
    };

    // 1. Index the 4 integration DOCX files
    let docx_files = [
        "tests/integration/forms_tabu-003.docx",
        "tests/integration/forms_tabu-008.docx",
        "tests/integration/forms_tabu-014.docx",
        "tests/integration/forms_tabu-017.docx",
    ];

    println!("Indexing integration DOCX files...");
    for doc_file in &docx_files {
        let path = Path::new(doc_file);
        assert!(path.exists(), "DOCX file not found: {:?}", doc_file);
        let index_res = index_file_core(db_path, &provider, path, &index_options, true)
            .await
            .unwrap_or_else(|e| panic!("Failed to index {:?}: {}", doc_file, e));
        println!("Indexed {:?}: {}", doc_file, index_res);
    }

    // Verify all 4 are in the DB
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM documents").unwrap();
    let count: i64 = stmt.query_row([], |r| r.get(0)).unwrap();
    assert_eq!(count, 4, "All 4 documents should be indexed in DB");

    // Let's verify chunks exist for vector search
    let mut stmt_chunks = conn.prepare("SELECT COUNT(*) FROM document_chunks").unwrap();
    let chunk_count: i64 = stmt_chunks.query_row([], |r| r.get(0)).unwrap();
    assert!(chunk_count > 0, "Vector chunks should have been generated");

    // ─── SCENARIO 1: Search for Caution Note (בקשה לרישום הערת אזהרה) ───
    println!("Running SCENARIO 1: Caution Note search...");
    let search_results_1 = query_search_documents_core(
        db_path,
        &provider,
        "הערת אזהרה באילת",
        5,
        &SearchOptions {
            use_llm_query_analysis: true,
            use_llm_rerank: true,
        },
    )
    .await
    .expect("Search failed");

    assert!(!search_results_1.is_empty(), "Scenario 1 should return results");
    // The caution note document contains "בקשה לרישום הערת אזהרה"
    let first_result_1 = &search_results_1[0];
    assert!(
        first_result_1.file_name.contains("tabu-003") || first_result_1.title.as_ref().unwrap().contains("אזהרה"),
        "Scenario 1 should return caution note (forms_tabu-003.docx) first, got: {:?}", first_result_1.file_name
    );

    // ─── SCENARIO 2: Search for Mortgage Redemption (שטר פדיון משכנתה) ───
    println!("Running SCENARIO 2: Mortgage Redemption search...");
    let search_results_2 = query_search_documents_core(
        db_path,
        &provider,
        "פדיון משכנתה של משה ישראלי",
        5,
        &SearchOptions {
            use_llm_query_analysis: true,
            use_llm_rerank: true,
        },
    )
    .await
    .expect("Search failed");

    assert!(!search_results_2.is_empty(), "Scenario 2 should return results");
    let first_result_2 = &search_results_2[0];
    assert!(
        first_result_2.file_name.contains("tabu-014") || first_result_2.title.as_ref().unwrap().contains("משכנתה"),
        "Scenario 2 should return mortgage redemption (forms_tabu-014.docx) first, got: {:?}", first_result_2.file_name
    );

    // ─── SCENARIO 3: Search for Easement (שטר זיקת הנאה) ───
    println!("Running SCENARIO 3: Easement search...");
    let search_results_3 = query_search_documents_core(
        db_path,
        &provider,
        "זיקת הנאה בנק לאומי",
        5,
        &SearchOptions {
            use_llm_query_analysis: true,
            use_llm_rerank: true,
        },
    )
    .await
    .expect("Search failed");

    assert!(!search_results_3.is_empty(), "Scenario 3 should return results");
    let first_result_3 = &search_results_3[0];
    assert!(
        first_result_3.file_name.contains("tabu-017") || first_result_3.title.as_ref().unwrap().contains("זיקת"),
        "Scenario 3 should return easement (forms_tabu-017.docx) first, got: {:?}", first_result_3.file_name
    );

    // ─── SCENARIO 4: Search for Lease (רישום זכות חכירה) ───
    println!("Running SCENARIO 4: Lease right search...");
    let search_results_4 = query_search_documents_core(
        db_path,
        &provider,
        "זכות חכירה רשות מקרקעי ישראל",
        5,
        &SearchOptions {
            use_llm_query_analysis: true,
            use_llm_rerank: true,
        },
    )
    .await
    .expect("Search failed");

    assert!(!search_results_4.is_empty(), "Scenario 4 should return results");
    let first_result_4 = &search_results_4[0];
    assert!(
        first_result_4.file_name.contains("tabu-008") || first_result_4.title.as_ref().unwrap().contains("חכירה"),
        "Scenario 4 should return lease right (forms_tabu-008.docx) first, got: {:?}", first_result_4.file_name
    );

    // Cleanup db
    let _ = fs::remove_file(db_path);
}
