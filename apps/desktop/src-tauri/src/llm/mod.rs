pub mod llm_provider;
pub mod llm_settings;
pub mod llm_local_mode;

pub use llm_settings::*;
pub use llm_local_mode::*;
use serde::{Deserialize, Serialize};

const EXTRACTION_PROMPT: &str = r#"You are a document analyst. Read the document text below and extract metadata as a single JSON object. Be concise and precise. Use null for any field you cannot determine.

IMPORTANT: Your response must be ONLY valid JSON. Do not include any explanatory text, markdown formatting, or code blocks. Start your response directly with { and end with }.

Required JSON fields:
{
  "doc_type": { "type_name": probability_float, ... } (e.g. {"contract": 0.8, "letter": 0.2}) where type_name must be one of: "contract", "report", "invoice", "memo", "specification", "presentation", "spreadsheet", "letter", "policy", "manual", "will", "other". Include up to 3 highest matching types, and probabilities must sum to approximately 1.0.
  "title": "the document title or best inferred title",
  "summary": "2-3 sentence summary of what this document is about, written in the same language as the document",
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

const EXTRACTION_PROMPT_LOCAL: &str = r#"You are a document analyst. Read the document text below and extract metadata as a single JSON object. Be concise and precise. Use null for any field you cannot determine.

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

// ── request / response shapes ─────────────────────────────────────────────────

#[derive(Serialize)]
struct RequestMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<RequestMessage>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ContentBlock>,
}

// ── public types ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct DocumentMetadata {
    pub doc_type: Option<serde_json::Value>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub authors: Option<Vec<String>>,
    pub date: Option<String>,
    pub topics: Option<Vec<String>>,
    pub entities: Option<Vec<String>>,
    pub language: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub confidence: Option<f64>,
}

// ── API call ──────────────────────────────────────────────────────────────────

// ── Private HTTP helper ───────────────────────────────────────────────────────

async fn post_message(prompt: String, api_key: &str, model: &str, max_tokens: u32) -> Result<String, String> {
    let body = ClaudeRequest {
        model: model.to_string(),
        max_tokens,
        messages: vec![RequestMessage { role: "user", content: prompt }],
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Claude API error {status}: {body}"));
    }

    let resp: ClaudeResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {e}"))?;

    Ok(resp.content.into_iter().next().map(|b| b.text).unwrap_or_default())
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Analyze a document and return structured metadata (JSON parsed) using a unified provider.
pub async fn call_provider(provider: &llm_provider::LlmProvider, text: &str) -> Result<DocumentMetadata, String> {
    let truncated = if text.len() > 12000 {
        format!("{}\n[... document truncated ...]", &text[..12000])
    } else {
        text.to_string()
    };
    
    let is_local = match provider {
        llm_provider::LlmProvider::Local(_) => true,
        _ => false,
    };
    let prompt_template = if is_local {
        EXTRACTION_PROMPT_LOCAL
    } else {
        EXTRACTION_PROMPT
    };

    let prompt = prompt_template.replace("{text}", &truncated);
    let raw = provider.call_structured(&prompt, None).await?;
    let json_str = clean_json(&raw);
    serde_json::from_str::<DocumentMetadata>(&json_str)
        .map_err(|e| format!("Failed to parse metadata JSON: {e}. Raw: {}", json_str.chars().take(200).collect::<String>()))
}

/// Analyze a document and return structured metadata (JSON parsed) via Claude.
pub async fn call_claude(text: &str, api_key: &str, model: &str) -> Result<DocumentMetadata, String> {
    let provider = llm_provider::get_active_provider(llm_provider::ProviderConfig {
        provider_type: "claude".to_string(),
        api_key: api_key.to_string(),
        model: model.to_string(),
        base_url: None,
    });
    call_provider(&provider, text).await
}

/// Send a single user-turn message and return the raw text response.
pub async fn call_claude_simple(prompt: &str, api_key: &str, model: &str) -> Result<String, String> {
    post_message(prompt.to_string(), api_key, model, 512).await
}

/// Analyze a document with a custom prompt and return the raw text response.
pub async fn call_claude_raw(text: &str, api_key: &str, model: &str, system_prompt: &str) -> Result<String, String> {
    let truncated = if text.len() > 12000 {
        format!("{}\n[... document truncated ...]", &text[..12000])
    } else {
        text.to_string()
    };
    let prompt = format!("{system_prompt}\n\nDocument:\n---\n{truncated}\n---");
    post_message(prompt, api_key, model, 2000).await
}

// strips markdown code fences and finds the JSON object boundaries
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

#[cfg(test)]
mod tests {
    use super::clean_json;

    #[test]
    fn test_clean_json_already_clean() {
        let input = "{\"key\": \"value\"}";
        assert_eq!(clean_json(input), "{\"key\": \"value\"}");
    }

    #[test]
    fn test_clean_json_markdown_fences() {
        let input = "```json\n{\"key\": \"value\"}\n```";
        assert_eq!(clean_json(input), "{\"key\": \"value\"}");

        let input_no_lang = "```\n{\"key\": \"value\"}\n```";
        assert_eq!(clean_json(input_no_lang), "{\"key\": \"value\"}");
    }

    #[test]
    fn test_clean_json_leading_trailing_text() {
        let input = "Here is the response:\n{\"key\": \"value\"}\nHope this helps!";
        assert_eq!(clean_json(input), "{\"key\": \"value\"}");
    }

    #[test]
    fn test_clean_json_combined_fences_and_text() {
        let input = "Sure, here is the JSON:\n```json\n{\"key\": \"value\"}\n```\nLet me know if you need anything else.";
        assert_eq!(clean_json(input), "{\"key\": \"value\"}");
    }

    #[test]
    fn test_clean_json_nested_braces() {
        let input = "```json\n{\"key\": {\"nested\": [1, 2, 3]}}\n```";
        assert_eq!(clean_json(input), "{\"key\": {\"nested\": [1, 2, 3]}}");
    }

    #[test]
    fn test_clean_json_invalid_braces() {
        let input = "no braces here";
        assert_eq!(clean_json(input), "no braces here");

        let input_open_only = "{\"only_open\": 123";
        assert_eq!(clean_json(input_open_only), "{\"only_open\": 123");
    }
}
