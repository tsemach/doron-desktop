use crate::common::{start_llama_server_test, call_with_retry};
use tauri_app_lib::llm::{
    llm_provider::{get_active_provider, LlmProvider, ProviderConfig},
    DocumentMetadata,
};
use serde_json::Value;

fn clean_json(raw: &str) -> String {
    let s = raw.trim();
    let s = if s.starts_with("```") {
        s.splitn(3, "```")
            .nth(1)
            .unwrap_or(s)
            .trim_start_matches("json")
            .trim()
    } else {
        s
    };
    match (s.find('{'), s.rfind('}')) {
        (Some(start), Some(end)) if end > start => s[start..=end].to_string(),
        _ => s.to_string(),
    }
}

// ── Shared Test Implementation ────────────────────────────────────────────────

#[derive(serde::Deserialize, Debug)]
#[allow(dead_code)]
struct QueryAnalysis {
    intent: Option<String>,
    keywords: Option<Vec<String>>,
    entities: Option<Vec<String>>,
    doc_types: Option<Value>,
}

const QUERY_ANALYSIS_PROMPT_LOCAL: &str = r#"You are a document search expert. Analyze the following query and extract search parameters for a full-text document index.

Return a JSON object with:
{
  "intent": "what the user is looking for",
  "keywords": ["content terms that would literally appear inside the documents — always include the subject nouns; EXCLUDE only pure query-intent verbs such as מצא, חפש, הצג, find, search, show, list"],
  "entities": ["specific company names, people names, or places explicitly mentioned"],
  "doc_types": ["one or more of: contract, report, invoice, memo, specification, presentation, spreadsheet, letter, policy, manual, will, other"],
  "language": "ISO 639-1 code if specified, else null",
  "date_range": {"from": "YYYY-MM-DD or null", "to": "YYYY-MM-DD or null"},
  "summary_importance": true or false
}

Rules:
- Always extract content nouns as keywords (e.g. "חוזה שכירות" → keywords: ["חוזה", "שכירות"])
- Strip only the verb wrapper (מצא/find/חפש) — keep everything else as keywords
- doc_types is supplemental metadata, not a replacement for keywords
- keep keywords to the 1-3 most distinctive terms

Respond ONLY with valid JSON. No markdown or explanation.

Query: מצא לי חוזה שכירות של אלי נחמיאס משנת 2023"#;



async fn run_brief_test(provider: &LlmProvider) {
    // Case 1: Simple chat (json_mode = false)
    println!("Testing simple chat...");
    let chat_res = call_with_retry(|| async {
        provider
            .call_simple("Perform a brief system check. Reply with exactly the word 'OK'.", None, None)
            .await
    })
    .await
    .expect("Simple chat should succeed");
    
    assert!(chat_res.to_uppercase().contains("OK"), "Expected response to contain 'OK', got: '{}'", chat_res);
}

async fn call_provider_plain(provider: &LlmProvider, text: &str) -> Result<DocumentMetadata, String> {
    let truncated = if text.len() > 12000 {
        format!("{}\n[... document truncated ...]", &text[..12000])
    } else {
        text.to_string()
    };
    
    let prompt_template = r#"You are a document analyst. Read the document text below and extract metadata as a single JSON object. Be concise and precise. Use null for any field you cannot determine.

IMPORTANT: Your response must be ONLY valid JSON. Do not include any explanatory text, markdown formatting, or code blocks. Start your response directly with { and end with }.

Required JSON fields:
{
  "doc_type": "one of: contract, report, invoice, memo, specification, presentation, spreadsheet, letter, policy, manual, will, other",
  "title": "the document title or best inferred title (written in the same language as the document, e.g. Hebrew)",
  "summary": "2-3 sentence summary of what this document is about (written in the same language as the document, e.g. Hebrew)",
  "authors": ["list of author names if found, else empty list"],
  "date": "YYYY-MM-DD if a clear document date exists, else null",
  "topics": ["up to 6 key topics or subject areas"],
  "entities": ["notable companies, people, products, or places mentioned"],
  "language": "ISO 639-1 code e.g. en, he, fr",
  "keywords": ["up to 10 important keywords for search"],
  "confidence": a float 0.0-1.0 reflecting how confident you are in the extraction
}

Document text (may be truncated):
---
{text}
---"#;

    let prompt = prompt_template.replace("{text}", &truncated);
    let raw = provider.call_simple(&prompt, None, None).await?;
    let json_str = clean_json(&raw);
    serde_json::from_str::<DocumentMetadata>(&json_str)
        .map_err(|e| format!("Failed to parse metadata JSON: {e}. Raw: {json_str}"))
}

async fn run_plain_text_test_suite(provider: &LlmProvider) {
    // Case 2: Query Analysis (json_mode = false, asking for JSON in the prompt only)
    println!("Testing query analysis (plain text)...");
    let query_res_raw = call_with_retry(|| async {
        provider
            .call_simple(QUERY_ANALYSIS_PROMPT_LOCAL, Some("You are a search query compiler. Always respond with valid JSON."), None)
            .await
    })
    .await
    .expect("Query analysis plain text call should succeed");

    let cleaned_query = clean_json(&query_res_raw);
    let parsed_query: QueryAnalysis = serde_json::from_str(&cleaned_query)
        .unwrap_or_else(|e| panic!("Failed to parse QueryAnalysis JSON: {}. Raw: {}", e, cleaned_query));

    assert!(parsed_query.keywords.is_some(), "Keywords should be parsed");
    let kw = parsed_query.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");
    println!("Extracted keywords (plain text): {:?}", kw);

    // Case 3: Metadata extraction (json_mode = false, using call_provider_plain helper)
    println!("Testing document metadata extraction (plain text)...");
    let doc_text = "חוזה שכירות דירה ברחוב דיזנגוף 77 בתל אביב בין המשכיר יעל אוחנה לשוכר אלי נחמיאס מתאריך 2023-05-15";
    let metadata: DocumentMetadata = call_with_retry(|| async {
        call_provider_plain(provider, doc_text).await
    })
    .await
    .expect("Local provider metadata extraction (plain text) should succeed");

    assert!(metadata.title.is_some(), "Title should be extracted");
    let title = metadata.title.unwrap();
    assert!(title.contains("שכירות") || title.contains("שכירות דירה") || title.len() > 0, "Title is empty or invalid: {}", title);
    println!("Extracted title (plain text): {}", title);
}

async fn run_json_test_suite(provider: &LlmProvider) {
    // Case 2: Query Analysis (json_mode = true, mimicking real search query extraction)
    println!("Testing query analysis (JSON mode)...");
    let query_res_raw = call_with_retry(|| async {
        provider
            .call_structured(QUERY_ANALYSIS_PROMPT_LOCAL, Some("You are a search query compiler. Always respond with valid JSON."), None)
            .await
    })
    .await
    .expect("Query analysis structured call should succeed");

    let cleaned_query = clean_json(&query_res_raw);
    let parsed_query: QueryAnalysis = serde_json::from_str(&cleaned_query)
        .unwrap_or_else(|e| panic!("Failed to parse QueryAnalysis JSON: {}. Raw: {}", e, cleaned_query));

    assert!(parsed_query.keywords.is_some(), "Keywords should be parsed");
    let kw = parsed_query.keywords.unwrap();
    assert!(!kw.is_empty(), "Keywords list should not be empty");
    println!("Extracted keywords (JSON mode): {:?}", kw);

    // Case 3: Metadata extraction (json_mode = true, using call_provider helper)
    println!("Testing document metadata extraction (JSON mode)...");
    let doc_text = "חוזה שכירות דירה ברחוב דיזנגוף 77 בתל אביב בין המשכיר יעל אוחנה לשוכר אלי נחמיאס מתאריך 2023-05-15";
    let metadata: DocumentMetadata = call_with_retry(|| async {
        tauri_app_lib::llm::call_provider(provider, doc_text).await
    })
    .await
    .expect("Local provider metadata extraction should succeed");

    assert!(metadata.title.is_some(), "Title should be extracted");
    let title = metadata.title.unwrap();
    assert!(title.contains("שכירות") || title.contains("שכירות דירה") || title.len() > 0, "Title is empty or invalid: {}", title);
    println!("Extracted title (JSON mode): {}", title);
}

#[tokio::test]
async fn test_phi4_brief() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10081;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping Phi-4 brief test: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    run_brief_test(&provider).await;
}

#[tokio::test]
async fn test_phi4_plain_text() {
    let model_name = "phi-4-mini-instruct (3.8b q4)";
    let port = 10082;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping Phi-4 plain-text test: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    run_plain_text_test_suite(&provider).await;
}

#[tokio::test]
async fn test_qwen_brief() {
    let model_name = "qwen-2.5-1.5b-instruct (q4)";
    let port = 10083;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping Qwen brief test: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    run_brief_test(&provider).await;
}

#[tokio::test]
async fn test_qwen_plain_text() {
    let model_name = "qwen-2.5-1.5b-instruct (q4)";
    let port = 10084;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping Qwen plain-text test: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    run_plain_text_test_suite(&provider).await;
}

#[tokio::test]
async fn test_qwen_json() {
    let model_name = "qwen-2.5-1.5b-instruct (q4)";
    let port = 10085;

    let _guard = match start_llama_server_test(model_name, port).await {
        Ok(g) => g,
        Err(e) => {
            println!("Skipping Qwen JSON test: model not found: {}", e);
            return;
        }
    };

    let provider = get_active_provider(ProviderConfig {
        provider_type: "local".to_string(),
        api_key: "".to_string(),
        model: model_name.to_string(),
        base_url: Some(format!("http://127.0.0.1:{}", port)),
    });

    run_json_test_suite(&provider).await;
}
