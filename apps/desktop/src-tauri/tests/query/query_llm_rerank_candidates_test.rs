use tauri_app_lib::{
    llm::llm_provider::{get_active_provider, ProviderConfig},
    query::{llm::query_llm_rerank_candidates, DocumentRow},
};
use super::common::{start_llama_server_test, call_with_retry};

#[tokio::test]
async fn test_local_candidate_reranking_phi() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10092;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local candidate reranking phi test: model not found: {}", e);
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local candidate reranking...");
    let candidates = vec![
        DocumentRow {
            id: 1,
            file_path: "heskem_gerushin_abraham.docx".to_string(),
            file_name: "heskem_gerushin_abraham.docx".to_string(),
            title: Some("הסכם גירושין".to_string()),
            summary: Some("הסכם גירושין ופירוד משותף הכולל משמורת ילדים משותפת".to_string()),
            doc_type: Some("contract".to_string()),
            doc_date: Some("2024-05-12".to_string()),
            language: Some("he".to_string()),
            keywords: vec!["גירושין".to_string(), "הסכם".to_string(), "ילדים".to_string()],
            topics: vec![],
            entities: vec![],
            authors: vec![],
            page_count: None,
            confidence: None,
        },
        DocumentRow {
            id: 2,
            file_path: "invoice_office_supplies.docx".to_string(),
            file_name: "invoice_office_supplies.docx".to_string(),
            title: Some("חשבונית רכש".to_string()),
            summary: Some("חשבונית עבור ציוד משרדי וריהוט".to_string()),
            doc_type: Some("invoice".to_string()),
            doc_date: Some("2023-11-20".to_string()),
            language: Some("he".to_string()),
            keywords: vec![],
            topics: vec![],
            entities: vec![],
            authors: vec![],
            page_count: None,
            confidence: None,
        },
    ];

    let sorted = call_with_retry(|| async {
        query_llm_rerank_candidates("חוזה משמורת ילדים משותפת", candidates.clone(), &provider).await
    })
    .await
    .expect("Candidate reranking should succeed");

    println!("Reranked results count: {}", sorted.len());
    for doc in &sorted {
        println!(" - ID: {}, Title: {:?}", doc.id, doc.title);
    }

    assert!(!sorted.is_empty(), "Should return reranked candidates");
    assert_eq!(sorted[0].id, 1, "The divorce agreement (ID 1) should be ranked first as it specifically covers child custody");
}

#[tokio::test]
async fn test_local_candidate_reranking_qwen() {
    let model_name = "qwen-2.5-3b-instruct (q4)";
    let port = 10095;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            panic!("local candidate reranking qwen test: model not found: {}", e);
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local candidate reranking...");
    let candidates = vec![
        DocumentRow {
            id: 1,
            file_path: "heskem_gerushin_abraham.docx".to_string(),
            file_name: "heskem_gerushin_abraham.docx".to_string(),
            title: Some("הסכם גירושין".to_string()),
            summary: Some("הסכם גירושין ופירוד משותף הכולל משמורת ילדים משותפת".to_string()),
            doc_type: Some("contract".to_string()),
            doc_date: Some("2024-05-12".to_string()),
            language: Some("he".to_string()),
            keywords: vec!["גירושין".to_string(), "הסכם".to_string(), "ילדים".to_string()],
            topics: vec![],
            entities: vec![],
            authors: vec![],
            page_count: None,
            confidence: None,
        },
        DocumentRow {
            id: 2,
            file_path: "invoice_office_supplies.docx".to_string(),
            file_name: "invoice_office_supplies.docx".to_string(),
            title: Some("חשבונית רכש".to_string()),
            summary: Some("חשבונית עבור ציוד משרדי וריהוט".to_string()),
            doc_type: Some("invoice".to_string()),
            doc_date: Some("2023-11-20".to_string()),
            language: Some("he".to_string()),
            keywords: vec![],
            topics: vec![],
            entities: vec![],
            authors: vec![],
            page_count: None,
            confidence: None,
        },
    ];

    let sorted = call_with_retry(|| async {
        query_llm_rerank_candidates("חוזה משמורת ילדים משותפת", candidates.clone(), &provider).await
    })
    .await
    .expect("Candidate reranking should succeed");

    println!("Reranked results count: {}", sorted.len());
    for doc in &sorted {
        println!(" - ID: {}, Title: {:?}", doc.id, doc.title);
    }

    assert!(!sorted.is_empty(), "Should return reranked candidates");
    assert_eq!(sorted[0].id, 1, "The divorce agreement (ID 1) should be ranked first as it specifically covers child custody");
}

#[tokio::test]
async fn test_local_candidate_reranking_empty() {
    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: "phi-4-mini-instruct (3.8b q4)".to_string(),
        base_url: Some("http://127.0.0.1:9999".to_string()),
    });

    let candidates: Vec<DocumentRow> = vec![];
    let result = query_llm_rerank_candidates("any query", candidates, &provider).await;
    assert!(result.is_ok());
    let sorted = result.unwrap();
    assert!(sorted.is_empty(), "Should return empty list for empty candidates");
}

#[tokio::test]
async fn test_local_candidate_reranking_single() {
    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: "phi-4-mini-instruct (3.8b q4)".to_string(),
        base_url: Some("http://127.0.0.1:9999".to_string()),
    });

    let candidate = DocumentRow {
        id: 42,
        file_path: "some_doc.docx".to_string(),
        file_name: "some_doc.docx".to_string(),
        title: Some("Single Doc".to_string()),
        summary: Some("Summary".to_string()),
        doc_type: None,
        doc_date: None,
        language: None,
        keywords: vec![],
        topics: vec![],
        entities: vec![],
        authors: vec![],
        page_count: None,
        confidence: None,
    };

    let candidates = vec![candidate.clone()];
    let result = query_llm_rerank_candidates("any query", candidates, &provider).await;
    assert!(result.is_ok());
    let sorted = result.unwrap();
    assert_eq!(sorted.len(), 1, "Should return the same single candidate");
    assert_eq!(sorted[0].id, 42);
}

#[tokio::test]
async fn test_local_candidate_reranking_no_relevant() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10095;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping local candidate reranking no-relevant test: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    println!("Testing local candidate reranking with no relevant results...");
    let candidates = vec![
        DocumentRow {
            id: 1,
            file_path: "cat_video.txt".to_string(),
            file_name: "cat_video.txt".to_string(),
            title: Some("Funny Cat Playing with Yarn".to_string()),
            summary: Some("A short video description of a playful kitten chasing a ball of blue yarn around the living room rug".to_string()),
            doc_type: Some("other".to_string()),
            doc_date: None,
            language: Some("en".to_string()),
            keywords: vec![],
            topics: vec![],
            entities: vec![],
            authors: vec![],
            page_count: None,
            confidence: None,
        },
        DocumentRow {
            id: 2,
            file_path: "pizza_recipe.txt".to_string(),
            file_name: "pizza_recipe.txt".to_string(),
            title: Some("Homemade Pizza Recipe".to_string()),
            summary: Some("A step-by-step recipe for making pizza dough, tomato sauce, and topping it with mozzarella".to_string()),
            doc_type: Some("other".to_string()),
            doc_date: None,
            language: Some("en".to_string()),
            keywords: vec![],
            topics: vec![],
            entities: vec![],
            authors: vec![],
            page_count: None,
            confidence: None,
        },
    ];

    let sorted = call_with_retry(|| async {
        query_llm_rerank_candidates("divorce agreement between spouses", candidates.clone(), &provider).await
    })
    .await
    .expect("Candidate reranking should succeed");

    println!("Reranked results count: {}", sorted.len());
    assert!(sorted.is_empty(), "Candidates list should be empty when none are relevant to a divorce query");
}
