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

const RERANK_PROMPT: &str = r#"You are a legal document search reranker.
Analyze the user query and the list of candidate documents below.
Identify which candidates are actually relevant to the user query.
Sort them by relevance (most relevant first).
Exclude any candidates that do not match the specific intent (e.g. if query is for rental "שכירות", exclude sale "מכר", loan "הלוואה", or employment "העסקה").

Return ONLY a JSON array of integers representing the relevant document IDs. No markdown, no code blocks, no explanation.

User Query: "{query}"

Candidates:
{candidates_json}"#;

// ── LLM query analysis ────────────────────────────────────────────────────────

pub(crate) async fn analyze_query(query: &str, provider: &crate::llm::llm_provider::LlmProvider) -> Result<QueryAnalysis, String> {
    let prompt = QUERY_ANALYSIS_PROMPT.replace("{query}", query);
    let raw = provider.call_structured(&prompt, None).await?;
    let json_str = clean_json(&raw);
    serde_json::from_str::<QueryAnalysis>(&json_str)
        .map_err(|e| format!("Failed to parse query analysis: {e}. Raw: {}", &json_str[..json_str.len().min(300)]))
}

// Rerank candidates using Claude
pub(crate) async fn rerank_candidates(
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

    let response_raw = provider.call_structured(&prompt, None).await?;
    let cleaned = clean_json(&response_raw);

    let matched_ids: Vec<i64> = serde_json::from_str(&cleaned)
        .map_err(|e| format!("Failed to parse rerank list: {e}. Raw: {cleaned}"))?;

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
