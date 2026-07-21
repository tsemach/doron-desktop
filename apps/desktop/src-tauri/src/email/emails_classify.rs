use serde::{Deserialize, Serialize};

use crate::llm::llm_provider::LlmProvider;

use super::emails_classify_deterministic::{extract_email_signals, merge_search_terms};
use super::emails_classify_llm::call_email_structured;

pub use super::emails_classify_deterministic::EmailExtractedSignals;

/// LLM output for a single email read pass.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct EmailClassification {
    pub summary: String,
    pub review: bool,
    pub review_reason: String,
    /// Case-linking terms, most confident first (case numbers, names, dates, etc.).
    #[serde(default)]
    pub search_terms: Vec<String>,
}

const CLASSIFY_SYSTEM_PROMPT: &str = "\
You read emails for a law office inbox. \
Return valid JSON only with this shape:\n\
{\"summary\": string, \"review\": boolean, \"review_reason\": string, \"search_terms\": [string]}\n\
summary: one concise sentence describing what the email is about.\n\
review: true if the email is related to cases the law firm is representing. \
false for marketing, newsletters, system/OTP notifications, and clearly personal unrelated mail.\n\
review_reason: short explanation for the review decision.\n\
search_terms: any piece of information that could connect this email to a specific case \
(case/court reference numbers, client or party names, invoice numbers, hearing dates, \
addresses, email addresses, phone numbers, salient topic phrases). \
List strongest/most specific signals first, weakest last. Use an empty array when none apply.";

pub fn extract_signals(sender: &str, subject: &str, snippet: &str) -> EmailExtractedSignals {
    extract_email_signals(sender, subject, snippet)
}

pub async fn classify_email_llm(
    provider: &LlmProvider,
    sender: &str,
    subject: &str,
    snippet: &str,
) -> Result<EmailClassification, String> {
    let signals = extract_email_signals(sender, subject, snippet);
    let deterministic_terms = signals.to_search_terms();
    let prompt = format!(
        "INCOMING EMAIL:\nFrom: {sender}\nSubject: {subject}\nSnippet: {snippet}\n\n\
         PRE-EXTRACTED SIGNALS (deterministic regex/header parse — treat as reliable facts):\n\
         {}\n\n\
         Use these signals in search_terms when relevant. \
         Read this email and return the JSON object.",
        signals.to_prompt_json()
    );
    let raw = call_email_structured(provider, &prompt, Some(CLASSIFY_SYSTEM_PROMPT)).await?;
    let mut classification = parse_classification_json(&raw)?;
    classification.search_terms =
        merge_search_terms(deterministic_terms, classification.search_terms);
    Ok(classification)
}

fn parse_classification_json(raw: &str) -> Result<EmailClassification, String> {
    let mut last_err = String::from("no JSON object found");

    for candidate in extract_json_object_candidates(raw) {
        for attempt in repair_attempts(&candidate) {
            match normalize_classification_json(&attempt) {
                Ok(classification) => return Ok(classification),
                Err(e) => last_err = format!("{e} (candidate: {attempt})"),
            }
        }
    }

    Err(format!(
        "Failed parsing classification JSON: {last_err}. Raw: {}",
        raw.chars().take(500).collect::<String>()
    ))
}

fn repair_attempts(json: &str) -> Vec<String> {
    let mut attempts = vec![json.to_string()];
    let repaired = repair_classification_json(json);
    if repaired != json {
        attempts.push(repaired);
    }
    attempts
}

fn repair_classification_json(json: &str) -> String {
    let mut s = repair_unescaped_string_quotes(json);
    while s.contains(", }") {
        s = s.replace(", }", " }");
    }
    while s.contains(",}") {
        s = s.replace(",}", "}");
    }
    while s.contains(", ]") {
        s = s.replace(", ]", " ]");
    }
    while s.contains(",]") {
        s = s.replace(",]", "]");
    }
    s
}

/// LLMs often emit Hebrew abbreviations like עו"ד with unescaped interior quotes.
fn repair_unescaped_string_quotes(json: &str) -> String {
    let chars: Vec<char> = json.chars().collect();
    let mut out = String::with_capacity(json.len() + 16);
    let mut i = 0;
    let mut in_string = false;
    let mut escape_next = false;

    while i < chars.len() {
        let ch = chars[i];
        if escape_next {
            out.push(ch);
            escape_next = false;
            i += 1;
            continue;
        }
        if ch == '\\' && in_string {
            out.push(ch);
            escape_next = true;
            i += 1;
            continue;
        }
        if ch == '"' {
            if !in_string {
                in_string = true;
                out.push(ch);
            } else if is_likely_string_end(&chars, i + 1) {
                in_string = false;
                out.push(ch);
            } else {
                out.push('\\');
                out.push('"');
            }
            i += 1;
            continue;
        }
        out.push(ch);
        i += 1;
    }
    out
}

fn is_likely_string_end(chars: &[char], start: usize) -> bool {
    let mut i = start;
    while i < chars.len() && chars[i].is_whitespace() {
        i += 1;
    }
    i >= chars.len() || matches!(chars[i], ',' | '}' | ']' | ':')
}

fn normalize_classification_json(json: &str) -> Result<EmailClassification, String> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("invalid JSON: {e}"))?;
    parse_classification_value(&v)
}

fn parse_classification_value(v: &serde_json::Value) -> Result<EmailClassification, String> {
    let summary = v
        .get("summary")
        .and_then(|s| s.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "missing summary".to_string())?;

    let review = v
        .get("review")
        .and_then(|r| r.as_bool())
        .ok_or_else(|| "missing review boolean".to_string())?;

    let review_reason = v
        .get("review_reason")
        .and_then(|r| r.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();

    let search_terms = dedupe_preserve_order(string_array(v.get("search_terms")));

    Ok(EmailClassification {
        summary,
        review,
        review_reason,
        search_terms,
    })
}

fn dedupe_preserve_order(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for v in values {
        let key = v.trim().to_lowercase();
        if key.is_empty() || seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        out.push(v.trim().to_string());
    }
    out
}

fn string_array(value: Option<&serde_json::Value>) -> Vec<String> {
    value
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::trim).filter(|s| !s.is_empty()))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn extract_json_object_candidates(raw: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut rest = raw;
    while let Some(start) = rest.find("```") {
        let after_fence = &rest[start + 3..];
        if let Some(end) = after_fence.find("```") {
            let block = after_fence[..end].trim_start_matches("json").trim();
            candidates.extend(json_object_candidates_from_text(block));
            rest = &after_fence[end + 3..];
        } else {
            break;
        }
    }
    candidates.extend(json_object_candidates_from_text(raw));
    candidates
}

fn json_object_candidates_from_text(s: &str) -> Vec<String> {
    let mut candidates = balanced_json_objects(s);
    if candidates.is_empty() {
        if let Some(candidate) = first_brace_to_last_brace(s) {
            candidates.push(candidate);
        }
    }
    candidates
}

fn first_brace_to_last_brace(s: &str) -> Option<String> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end > start {
        Some(s[start..=end].to_string())
    } else {
        None
    }
}

fn balanced_json_objects(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < s.len() {
        if s.as_bytes()[i] == b'{' {
            if let Some(end) = find_balanced_json_end(s, i) {
                out.push(s[i..=end].to_string());
                i = end + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn find_balanced_json_end(s: &str, start: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escape = false;

    for (offset, ch) in s[start..].char_indices() {
        if escape {
            escape = false;
            continue;
        }
        match ch {
            '\\' if in_string => escape = true,
            '"' => in_string = !in_string,
            '{' if !in_string => depth += 1,
            '}' if !in_string => {
                depth = depth.checked_sub(1)?;
                if depth == 0 {
                    return Some(start + offset);
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn parses_search_terms() {
        let raw = r#"{"summary": "Client update", "review": true, "review_reason": "Case work", "search_terms": ["12345/23", "יוסי כהן", "דיון"]}"#;
        let c = parse_classification_json(raw).unwrap();
        assert_eq!(c.search_terms, vec!["12345/23", "יוסי כהן", "דיון"]);
    }

    #[test]
    fn repairs_trailing_commas() {
        let raw = r#"{"summary": "Newsletter", "review": false, "review_reason": "Marketing", "search_terms": ["sale",], }"#;
        let c = parse_classification_json(raw).unwrap();
        assert!(!c.review);
    }

    #[test]
    fn repairs_unescaped_hebrew_quotes() {
        let raw = r#"```json
{"summary": "Update", "review": true, "review_reason": "Case work", "search_terms": ["עו"ד", "12345/23"]}
```"#;
        let c = parse_classification_json(raw).unwrap();
        assert_eq!(c.search_terms[0], "עו\"ד");
    }
}
