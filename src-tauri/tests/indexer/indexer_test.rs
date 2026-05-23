use rusqlite::Connection;
use std::path::Path;
use tauri_app_lib::{extractor, store};

/// Full pipeline test: extract → llm → store.
///
/// LLM step is skipped when ANTHROPIC_API_KEY is not set.
/// Run with a key:
///   ANTHROPIC_API_KEY=sk-... cargo test --test indexer -- --nocapture
#[tokio::test]
async fn test_index_document() {
    dotenvy::dotenv().ok();

    let doc_path = Path::new("tests/docs/tiviat-nezikin.docx");
    assert!(doc_path.exists(), "test document not found: {:?}", doc_path);

    // ── extract ───────────────────────────────────────────────────────────────
    let extracted = extractor::extract(doc_path).expect("extraction should succeed");
    assert!(!extracted.text.is_empty(), "extracted text should not be empty");

    println!("\n=== Extracted text ({} chars) ===", extracted.text.len());
    println!("{}", extracted.text);

    // ── llm ───────────────────────────────────────────────────────────────────
    let api_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
    let metadata = if api_key.is_empty() {
        println!("\n[llm] ANTHROPIC_API_KEY not set — skipping Claude call");
        tauri_app_lib::llm::DocumentMetadata {
            doc_type:   Some("document".to_string()),
            title:      Some("Tiviat Nezikin".to_string()),
            summary:    Some("Stub summary — LLM not called".to_string()),
            authors:    None,
            date:       None,
            topics:     None,
            entities:   None,
            language:   Some("he".to_string()),
            keywords:   None,
            confidence: None,
        }
    } else {
        let model = "claude-haiku-4-5-20251001".to_string();
        let m = tauri_app_lib::llm::call_claude(&extracted.text, &api_key, &model)
            .await
            .expect("Claude call should succeed");
        println!("\n=== Claude metadata ===");
        println!("doc_type  : {:?}", m.doc_type);
        println!("title     : {:?}", m.title);
        println!("summary   : {:?}", m.summary);
        println!("language  : {:?}", m.language);
        println!("keywords  : {:?}", m.keywords);
        println!("confidence: {:?}", m.confidence);
        m
    };

    // ── store ─────────────────────────────────────────────────────────────────
    let db_path = Path::new("tests/test_output.db");
    let conn = Connection::open(db_path).expect("should open test database");
    store::init_documents_schema(&conn).expect("schema init should succeed");

    let abs_path = doc_path.canonicalize().unwrap().to_string_lossy().to_string();
    let file_size_kb = std::fs::metadata(doc_path)
        .map(|m| m.len() as i64 / 1024)
        .unwrap_or(0);

    let record = store::DocumentRecord {
        file_path:    abs_path,
        file_name:    "tiviat-nezikin.docx".to_string(),
        file_ext:     "docx".to_string(),
        file_size_kb,
        doc_type:     metadata.doc_type,
        title:        metadata.title,
        summary:      metadata.summary,
        authors:      serde_json::to_string(&metadata.authors.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
        doc_date:     metadata.date,
        topics:       serde_json::to_string(&metadata.topics.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
        entities:     serde_json::to_string(&metadata.entities.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
        keywords:     serde_json::to_string(&metadata.keywords.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string()),
        language:     metadata.language,
        page_count:   extracted.page_count,
        confidence:   metadata.confidence,
        raw_metadata: format!(r#"{{"chars": {}, "source": "indexer_test"}}"#, extracted.text.len()),
    };

    store::insert_document(&conn, &record).expect("insert should succeed");
    println!("\n=== Stored to {:?} ===", db_path);
}
