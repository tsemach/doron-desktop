use std::collections::HashMap;
use super::types::{QueryAnalysis, DocumentRow, RerankCandidate};
use super::helpers::clean_json;

// ── Prompts ───────────────────────────────────────────────────────────────────

const QUERY_ANALYSIS_PROMPT: &str = r#"You are a document search expert. Analyze the following query and extract search parameters for a full-text document index.

Return a JSON object with:
{
  "intent": "what the user is looking for",
  "keywords": ["content terms that would literally appear inside the documents — always include the subject nouns; EXCLUDE only pure query-intent verbs such as מצא, חפש, הצג, find, search, show, list"],
  "entities": ["specific company names, people names, or places explicitly mentioned"],
  "doc_types": { "type_name": probability_float, ... } (e.g. {"contract": 0.8, "letter": 0.2}) where type_name must be one of: "contract", "report", "invoice", "memo", "specification", "presentation", "spreadsheet", "letter", "policy", "manual", "will", "other". Include up to 3 highest matching types, and probabilities must sum to approximately 1.0.
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

Query: {query}"#;

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

Query: {query}"#;

const RERANK_PROMPT: &str = r#"You are a legal document search reranker.
Analyze the user query and the list of candidate documents below.
Identify which candidates are actually relevant to the user query.
Sort them by relevance (most relevant first).
Exclude any candidates that do not match the specific intent (e.g. if query is for rental "שכירות", exclude sale "מכר", loan "הלוואה", or employment "העסקה").

Return ONLY a JSON object with a "relevant_ids" key containing an array of integers representing the relevant document IDs (most relevant first). If no candidates are relevant to the user query, return an empty array: {"relevant_ids": []}.

Example format:
{
  "relevant_ids": [12, 45]
}

No markdown, no code blocks, no explanation.

User Query: "{query}"

Candidates:
{candidates_json}"#;

// ── LLM query analysis ────────────────────────────────────────────────────────

pub async fn query_llm_analyze_query(query: &str, provider: &crate::llm::llm_provider::LlmProvider) -> Result<QueryAnalysis, String> {
    let is_local = match provider {
        crate::llm::llm_provider::LlmProvider::Local(_) => true,
        _ => false,
    };
    let prompt_template = if is_local {
        QUERY_ANALYSIS_PROMPT_LOCAL
    } else {
        QUERY_ANALYSIS_PROMPT
    };
    let prompt = prompt_template.replace("{query}", query);
    let raw = provider.call_structured(&prompt, None, Some(0.0)).await?;
    let json_str = clean_json(&raw);
    serde_json::from_str::<QueryAnalysis>(&json_str)
        .map_err(|e| format!("Failed to parse query analysis: {e}. Raw: {}", json_str.chars().take(300).collect::<String>()))
}

#[derive(serde::Deserialize)]
struct RerankResponse {
    relevant_ids: Vec<i64>,
}

// Rerank candidates using Claude
pub async fn query_llm_rerank_candidates(
    query: &str,
    candidates: Vec<DocumentRow>,
    provider: &crate::llm::llm_provider::LlmProvider,
) -> Result<Vec<DocumentRow>, String> {
    if candidates.is_empty() {
        return Ok(vec![]);
    }
    
    // If only one candidate was returned by local search, no need to call the API to rerank
    if candidates.len() == 1 {
        return Ok(candidates);
    }

    let rerank_items: Vec<RerankCandidate> = candidates
        .iter()
        .map(|c| RerankCandidate {
            id: c.id,
            file_name: c.file_name.clone(),
            title: c.title.clone(),
            summary: c.summary.clone(),
        })
        .collect();

    let candidates_json = serde_json::to_string(&rerank_items).unwrap_or_default();
    let prompt = RERANK_PROMPT
        .replace("{query}", query)
        .replace("{candidates_json}", &candidates_json);

    let response_raw = provider.call_structured(&prompt, None, Some(0.0)).await?;
    let cleaned = clean_json(&response_raw);

    let res: RerankResponse = serde_json::from_str(&cleaned)
        .map_err(|e| format!("Failed to parse rerank list: {e}. Raw: {cleaned}"))?;
    let matched_ids = res.relevant_ids;

    let mut candidates_map: HashMap<i64, DocumentRow> = candidates
        .into_iter()
        .map(|c| (c.id, c))
        .collect();

    let sorted: Vec<DocumentRow> = matched_ids
        .into_iter()
        .filter_map(|id| candidates_map.remove(&id))
        .collect();

    Ok(sorted)
}

/// Parses the query string heuristically without calling any LLM.
pub fn analyze_query_heuristically(query: &str) -> QueryAnalysis {
    let lowercase_query = query.to_lowercase();
    
    // 1. Detect document types
    let mut detected_types = Vec::new();
    if lowercase_query.contains("חוזה") || lowercase_query.contains("הסכם") || lowercase_query.contains("contract") || lowercase_query.contains("agreement") {
        detected_types.push("contract");
    }
    if lowercase_query.contains("דוח") || lowercase_query.contains("דו\"ח") || lowercase_query.contains("report") || lowercase_query.contains("סקירה") {
        detected_types.push("report");
    }
    if lowercase_query.contains("חשבונית") || lowercase_query.contains("invoice") {
        detected_types.push("invoice");
    }
    if lowercase_query.contains("מכתב") || lowercase_query.contains("letter") {
        detected_types.push("letter");
    }
    if lowercase_query.contains("צוואה") || lowercase_query.contains("will") {
        detected_types.push("will");
    }
    if lowercase_query.contains("פרוטוקול") || lowercase_query.contains("זיכרון דברים") || lowercase_query.contains("memo") {
        detected_types.push("memo");
    }

    let doc_types_val = if detected_types.is_empty() {
        None
    } else {
        Some(serde_json::json!(detected_types))
    };

    // 2. Detect years (e.g. 2024, 2025)
    let mut from_date = None;
    let mut to_date = None;
    for word in query.split_whitespace() {
        let clean_word: String = word.chars().filter(|c| c.is_ascii_digit()).collect();
        if clean_word.len() == 4 {
            if let Ok(year) = clean_word.parse::<i32>() {
                if year >= 1900 && year <= 2100 {
                    from_date = Some(format!("{}-01-01", year));
                    to_date = Some(format!("{}-12-31", year));
                    break;
                }
            }
        }
    }

    let date_range = if from_date.is_some() {
        Some(super::types::DateRange { from: from_date, to: to_date })
    } else {
        None
    };

    // 3. Extract keywords (split by delimiters and filter stop words)
    let stop_words = [
        "מצא", "חפש", "הצג", "את", "של", "ב", "ה", "ו", "מ", "ל", "ש",
        "find", "search", "show", "the", "a", "in", "of", "to", "for", "with", "on"
    ];
    
    let mut keywords = Vec::new();
    for word in query.split(&[' ', ',', '.', ';', ':', '-', '_', '(', ')', '[', ']'][..]) {
        let cleaned = word.trim().trim_matches(|c: char| !c.is_alphanumeric());
        if !cleaned.is_empty() && !stop_words.contains(&cleaned.to_lowercase().as_str()) {
            keywords.push(cleaned.to_string());
        }
    }

    QueryAnalysis {
        keywords: if keywords.is_empty() { None } else { Some(keywords) },
        entities: Some(vec![]),
        doc_types: doc_types_val,
        date_range,
        summary_importance: Some(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_rerank_response() {
        let json_str = r#"{"relevant_ids": [22, 28]}"#;
        let res: RerankResponse = serde_json::from_str(json_str).unwrap();
        assert_eq!(res.relevant_ids, vec![22, 28]);
    }
}


