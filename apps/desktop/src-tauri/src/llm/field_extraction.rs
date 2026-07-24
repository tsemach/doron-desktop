use tauri::AppHandle;
use serde::{Deserialize, Serialize};
use super::clean_json;
use super::llm_provider::LlmProvider;

const FIELD_EXTRACTION_PROMPT: &str = r#"You are a form-filling assistant. The user spoke a short phrase describing what field to fill and its value. Given the list of available field names below, determine which field they meant and what value to fill it with.

Available fields: {fields}

Return ONLY a JSON object with this exact shape:
{
  "field": "the exact matching field name from the available list, or null if no field is clearly referenced",
  "value": "the value to fill in, or null if unclear"
}

Rules:
- "field" must be EXACTLY one of the available field names listed above, verbatim, or null. Never invent a field name that isn't in the list.
- Match based on meaning, not just exact wording (e.g. a spoken "full name" could match a field literally named "name" or "full_name").
- If the text doesn't clearly reference any of the available fields, return {"field": null, "value": null}.
- When the value is a spoken sequence of digits (phone number, ID number, zip code, account number, amount, etc.), combine them into a single whole number/string with no separators — e.g. "seven two three eight" becomes "7238", never "7, 2, 3, 8".

Respond ONLY with valid JSON. No markdown, no explanation.

Spoken text: "{text}""#;

#[derive(Deserialize, Serialize, Debug, PartialEq)]
pub struct FieldExtractionResult {
    pub field: Option<String>,
    pub value: Option<String>,
}

/// Parses the model's raw response and validates the returned field name
/// against `available_fields` — the model can describe intent in its own
/// words, but the field it names back must be one we actually offered it,
/// verbatim. A hallucinated name is treated the same as "no match" (never
/// surfaced to the caller as if it were real), which also means a broken/
/// unparseable value never crashes the caller — it degrades to no-match.
fn parse_and_validate(raw: &str, available_fields: &[String]) -> Result<FieldExtractionResult, String> {
    let json_str = clean_json(raw);
    let result: FieldExtractionResult = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse field extraction result: {e}. Raw: {}", json_str.chars().take(300).collect::<String>()))?;

    match &result.field {
        Some(f) if !available_fields.contains(f) => Ok(FieldExtractionResult { field: None, value: None }),
        _ => Ok(result),
    }
}

/// Given transcribed text and the current template/document's actual field
/// names, extracts which field the user meant and what value to fill it
/// with. Provider resolution: when `provider` is given (e.g. the dedicated
/// voice-cloud setting, used so voice's cloud engine doesn't depend on the
/// main AI Provider setting staying on a cloud provider), it's resolved via
/// `resolve_voice_provider` -- online (backend-proxied) if `api_key` is
/// empty, BYOM (direct) otherwise; otherwise falls back to the normal
/// active-provider resolution, which is engine-independent since plain text
/// extraction works the same regardless of which LLM provider is configured
/// (including Claude and the local text model, which don't support audio
/// input but are perfectly fine for this text-only step).
#[tauri::command]
pub async fn extract_field_value(
    app: AppHandle,
    text: String,
    available_fields: Vec<String>,
    api_key: String,
    model: Option<String>,
    provider: Option<String>,
) -> Result<FieldExtractionResult, String> {
    let resolved_provider = match provider {
        Some(provider_type) => super::resolve_voice_provider(&app, provider_type, api_key, model, "field_extraction")?,
        None => super::load_active_provider(&app, api_key, model, "field_extraction")?,
    };

    // Free tier only for local-provider extraction ("ai_features"
    // FeatureKey, PLAN.md Phase 3) -- local AI stays completely ungated.
    let is_local = matches!(resolved_provider, LlmProvider::Local(_));
    if !is_local && !crate::auth::is_pro_tier(&app) {
        return Err("Field extraction via a cloud AI provider is a Pro feature.".to_string());
    }

    let fields_list = available_fields.join(", ");
    let prompt = FIELD_EXTRACTION_PROMPT
        .replace("{fields}", &fields_list)
        .replace("{text}", &text);

    let raw = resolved_provider.call_structured(&prompt, None, Some(0.0)).await?;
    parse_and_validate(&raw, &available_fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_field_passes_through() {
        let raw = r#"{"field": "full_name", "value": "Tsemach"}"#;
        let fields = vec!["full_name".to_string(), "email".to_string()];
        let result = parse_and_validate(raw, &fields).unwrap();
        assert_eq!(result, FieldExtractionResult { field: Some("full_name".to_string()), value: Some("Tsemach".to_string()) });
    }

    #[test]
    fn test_hallucinated_field_is_rejected() {
        let raw = r#"{"field": "made_up_field", "value": "something"}"#;
        let fields = vec!["full_name".to_string(), "email".to_string()];
        let result = parse_and_validate(raw, &fields).unwrap();
        assert_eq!(result, FieldExtractionResult { field: None, value: None });
    }

    #[test]
    fn test_no_match_passes_through_as_none() {
        let raw = r#"{"field": null, "value": null}"#;
        let fields = vec!["full_name".to_string()];
        let result = parse_and_validate(raw, &fields).unwrap();
        assert_eq!(result, FieldExtractionResult { field: None, value: None });
    }

    #[test]
    fn test_markdown_fenced_json_is_cleaned() {
        let raw = "```json\n{\"field\": \"email\", \"value\": \"a@b.com\"}\n```";
        let fields = vec!["email".to_string()];
        let result = parse_and_validate(raw, &fields).unwrap();
        assert_eq!(result, FieldExtractionResult { field: Some("email".to_string()), value: Some("a@b.com".to_string()) });
    }

    #[test]
    fn test_hebrew_field_value_roundtrip() {
        let raw = r#"{"field": "שם מלא", "value": "צמח מזרחי"}"#;
        let fields = vec!["שם מלא".to_string(), "אימייל".to_string()];
        let result = parse_and_validate(raw, &fields).unwrap();
        assert_eq!(result, FieldExtractionResult { field: Some("שם מלא".to_string()), value: Some("צמח מזרחי".to_string()) });
    }

    #[test]
    fn test_malformed_json_returns_error_not_panic() {
        let raw = "not json at all";
        let fields = vec!["full_name".to_string()];
        let result = parse_and_validate(raw, &fields);
        assert!(result.is_err());
    }
}
