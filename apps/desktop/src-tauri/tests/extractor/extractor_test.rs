use rusqlite::Connection;
use std::path::Path;
use tauri_app_lib::{extractor, store};

#[test]
fn test_extract_docx_and_store() {
    let doc_path = Path::new("tests/docs/tiviat-nezikin.docx");
    assert!(doc_path.exists(), "test document not found: {:?}", doc_path);

    // --- extract ---
    let extracted = extractor::extract(doc_path)
        .expect("extraction should succeed");

    assert!(!extracted.text.is_empty(), "extracted text should not be empty");

    println!("\n=== Extraction result ===");
    println!("characters : {}", extracted.text.len());
    println!("page_count : {:?}", extracted.page_count);
    println!("--- text preview (first 300 chars) ---");
    println!("{}", extracted.text.chars().take(300).collect::<String>());
    println!("--- full text ---");
    println!("{}", extracted.text);

    // --- open persistent DB (data intentionally left in) ---
    let db_path = Path::new("tests/test_output.db");
    let conn = Connection::open(db_path).expect("should open test database");
    store::init_documents_schema(&conn).expect("schema init should succeed");

    // --- build record ---
    let abs_path = doc_path.canonicalize().unwrap().to_string_lossy().to_string();
    let file_size_kb = std::fs::metadata(doc_path)
        .map(|m| m.len() as i64 / 1024)
        .unwrap_or(0);

    let record = store::DocumentRecord {
        file_path:    abs_path,
        file_name:    "tiviat-nezikin.docx".to_string(),
        file_ext:     "docx".to_string(),
        file_size_kb,
        doc_type:     Some("document".to_string()),
        title:        Some("Tiviat Nezikin".to_string()),
        summary:      Some("Extracted by integration test — no LLM".to_string()),
        authors:      "[]".to_string(),
        doc_date:     None,
        topics:       "[]".to_string(),
        entities:     "[]".to_string(),
        keywords:     "[]".to_string(),
        language:     Some("he".to_string()),
        page_count:   extracted.page_count,
        confidence:   None,
        raw_metadata: format!(r#"{{"chars": {}, "source": "integration_test"}}"#, extracted.text.len()),
        raw_text:     extracted.text.clone(),
    };

    // --- store (INSERT OR REPLACE so the test is re-runnable) ---
    store::insert_document(&conn, &record).expect("insert should succeed");

    println!("\n=== Stored to {:?} ===", db_path);
}
