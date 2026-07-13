use tauri_app_lib::{
    llm::llm_provider::{get_active_provider, ProviderConfig},
    query::llm::analyze_query,
};
use super::common::{start_llama_server_test, call_with_retry};

#[tokio::test]
async fn test_local_query_analysis() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10091;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local query analysis test: model not found: {}", e);
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local query analysis...");
    let query = "מצא חוזה שכירות של אלי נחמיאס משנת 2023";
    let analysis = call_with_retry(|| async {
        analyze_query(query, &provider).await
    })
    .await
    .expect("Query analysis should succeed");

    println!("Analysis output: {:?}", analysis);
    assert!(analysis.keywords.is_some(), "Should extract keywords");
    let kw = analysis.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");

    // 1. Verify keywords contain expected search terms
    let keywords_lower: Vec<String> = kw.iter().map(|k| k.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| k.contains("חוזה") || k.contains("שכירות")),
        "Keywords should contain terms related to rental/contract, got: {:?}", kw
    );
    let entities_lower: Vec<String> = analysis.entities.clone().unwrap_or_default().iter().map(|e| e.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| k.contains("נחמיאס") || k.contains("אלי")) ||
        entities_lower.iter().any(|e| e.contains("נחמיאס") || e.contains("אלי")),
        "Keywords or entities should contain the name, got keywords: {:?}, entities: {:?}", kw, analysis.entities
    );

    // 2. Verify document type is correct
    assert!(analysis.doc_types.is_some(), "Should extract document types");
    let doc_types_val = analysis.doc_types.unwrap();
    let doc_types_str = doc_types_val.to_string().to_lowercase();
    assert!(
        doc_types_str.contains("contract"),
        "Should infer 'contract' as document type, got: {}", doc_types_val
    );

    // 3. Verify year 2023 was parsed in the date range
    assert!(analysis.date_range.is_some(), "Should parse date range");
    let range = analysis.date_range.unwrap();
    assert!(
        range.from.as_deref().unwrap_or_default().contains("2023") || 
        range.to.as_deref().unwrap_or_default().contains("2023"),
        "Date range should capture the year 2023, got: from={:?}, to={:?}", range.from, range.to
    );
}

#[tokio::test]
async fn test_local_query_analysis_bilingual_employment() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10093;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local query analysis bilingual test: model not found: {}", e);
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local query analysis bilingual...");
    let query = "find חוזה העסקה של john doe from 2022";
    let analysis = call_with_retry(|| async {
        analyze_query(query, &provider).await
    })
    .await
    .expect("Bilingual query analysis should succeed");

    println!("Bilingual analysis output: {:?}", analysis);
    assert!(analysis.keywords.is_some(), "Should extract keywords");
    let kw = analysis.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");

    let keywords_lower: Vec<String> = kw.iter().map(|k| k.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| k.contains("חוזה") || k.contains("העסקה") || k.contains("employment")),
        "Keywords should contain terms related to employment/contract, got: {:?}", kw
    );
    let entities_lower: Vec<String> = analysis.entities.clone().unwrap_or_default().iter().map(|e| e.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| k.contains("john") || k.contains("doe")) ||
        entities_lower.iter().any(|e| e.contains("john") || e.contains("doe")),
        "Keywords or entities should contain the name, got keywords: {:?}, entities: {:?}", kw, analysis.entities
    );

    assert!(analysis.doc_types.is_some(), "Should extract document types");
    let doc_types_val = analysis.doc_types.unwrap();
    let doc_types_str = doc_types_val.to_string().to_lowercase();
    assert!(
        doc_types_str.contains("contract"),
        "Should infer 'contract' as document type, got: {}", doc_types_val
    );

    assert!(analysis.date_range.is_some(), "Should parse date range");
    let range = analysis.date_range.unwrap();
    assert!(
        range.from.as_deref().unwrap_or_default().contains("2022") || 
        range.to.as_deref().unwrap_or_default().contains("2022"),
        "Date range should capture the year 2022, got: from={:?}, to={:?}", range.from, range.to
    );
}

#[tokio::test]
async fn test_local_query_analysis_generic() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10094;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local query analysis generic test: model not found: {}", e);
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local query analysis generic...");
    let query = "ביטוח בריאות";
    let analysis = call_with_retry(|| async {
        analyze_query(query, &provider).await
    })
    .await
    .expect("Generic query analysis should succeed");

    println!("Generic analysis output: {:?}", analysis);
    assert!(analysis.keywords.is_some(), "Should extract keywords");
    let kw = analysis.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");

    let keywords_lower: Vec<String> = kw.iter().map(|k| k.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| {
            k.contains("ביטוח") || k.contains("בריאות") ||
            k.contains("insurance") || k.contains("health") ||
            k.contains("medical") || k.contains("care")
        }),
        "Keywords should contain insurance/health terms, got: {:?}", kw
    );
}

#[tokio::test]
async fn test_local_query_analysis_medical_phi() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10086;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local query analysis medical phi test: model not found: {}", e);
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local query analysis medical...");
    let query = "דוח ואבחנה לאחר סיבוך רפואי";
    let analysis = call_with_retry(|| async {
        analyze_query(query, &provider).await
    })
    .await
    .expect("Medical query analysis should succeed");

    println!("Medical analysis output: {:?}", analysis);
    assert!(analysis.keywords.is_some(), "Should extract keywords");
    let kw = analysis.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");

    let keywords_lower: Vec<String> = kw.iter().map(|k| k.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| {
            k.contains("דוח") || k.contains("אבחנה") || k.contains("סיבוך רפואי")
        }),
        "Keywords should contain medical terms, got: {:?}", kw
    );
}

#[tokio::test]
async fn test_local_query_analysis_medical_qwen() {
    let model_name = "qwen-2.5-3b-instruct (q4)";
    let port = 10121;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local query analysis medical qwen test: model not found: {}", e);            
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local query analysis medical...");
    let query = "דוח ואבחנה לאחר סיבוך רפואי";
    let analysis = call_with_retry(|| async {
        analyze_query(query, &provider).await
    })
    .await
    .expect("Medical query analysis should succeed");

    println!("Medical analysis output: {:?}", analysis);
    assert!(analysis.keywords.is_some(), "Should extract keywords");
    let kw = analysis.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");

    let keywords_lower: Vec<String> = kw.iter().map(|k| k.to_lowercase()).collect();
    assert!(
        keywords_lower.iter().any(|k| {
            k.contains("דוח") || k.contains("אבחנה") || k.contains("סיבוך רפואי")
        }),
        "Keywords should contain medical terms, got: {:?}", kw
    );
}
