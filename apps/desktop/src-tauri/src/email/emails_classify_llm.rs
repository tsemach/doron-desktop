//! Email-eval local LLM transport. Kept separate from the shared `LlmProvider` so
//! email classification can use the completions API (works with Gemma/Qwen sidecars)
//! without changing project-wide chat/completions behavior.

use serde::{Deserialize, Serialize};

use crate::llm::llm_provider::{LlmProvider, LocalProvider};

#[derive(Serialize)]
struct CompletionRequestBody {
    model: String,
    prompt: String,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct CompletionChoice {
    text: Option<String>,
}

#[derive(Deserialize)]
struct CompletionResponseBody {
    choices: Option<Vec<CompletionChoice>>,
}

#[derive(Deserialize)]
struct ModelsListEntry {
    id: Option<String>,
    name: Option<String>,
    model: Option<String>,
}

#[derive(Deserialize)]
struct ModelsListResponse {
    data: Option<Vec<ModelsListEntry>>,
    models: Option<Vec<ModelsListEntry>>,
}

fn build_completion_prompt(prompt: &str, system: Option<&str>) -> String {
    if let Some(sys) = system {
        format!("System: {sys}\n\nUser: {prompt}\n\nAssistant:")
    } else {
        format!("User: {prompt}\n\nAssistant:")
    }
}

async fn resolve_loaded_model_id(
    client: &reqwest::Client,
    base_url: &str,
    fallback: &str,
) -> String {
    let url = format!("{base_url}/models");
    let Ok(resp) = client.get(&url).send().await else {
        return fallback.to_string();
    };
    let Ok(list) = resp.json::<ModelsListResponse>().await else {
        return fallback.to_string();
    };
    list.data
        .or(list.models)
        .unwrap_or_default()
        .into_iter()
        .next()
        .and_then(|e| e.model.or(e.id).or(e.name))
        .unwrap_or_else(|| fallback.to_string())
}

async fn call_local_completions_structured(
    local: &LocalProvider,
    prompt: &str,
    system: Option<&str>,
) -> Result<String, String> {
    let system_prompt = match system {
        Some(sys) => format!("{sys}\n\nIMPORTANT: Your response must be valid JSON only."),
        None => "IMPORTANT: Your response must be valid JSON only.".to_string(),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let base_url = local
        .base_url
        .as_deref()
        .unwrap_or("http://localhost:10086/v1");
    let model_id = resolve_loaded_model_id(&client, base_url, &local.model).await;

    let body = CompletionRequestBody {
        model: model_id,
        prompt: build_completion_prompt(prompt, Some(&system_prompt)),
        max_tokens: Some(2048),
        temperature: Some(0.0),
    };

    let mut request = client
        .post(format!("{base_url}/completions"))
        .header("content-type", "application/json");

    if !local.api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", local.api_key));
    }

    let response = request
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Email local LLM request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Email local LLM error {status}: {body}"));
    }

    let resp: CompletionResponseBody = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse email local LLM response: {e}"))?;

    resp.choices
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.text)
        .ok_or_else(|| "Email local LLM returned empty choices".to_string())
}

/// Structured JSON call for email classification. Local sidecars use the legacy
/// completions endpoint; all other providers use the shared `LlmProvider` API.
pub async fn call_email_structured(
    provider: &LlmProvider,
    prompt: &str,
    system: Option<&str>,
) -> Result<String, String> {
    match provider {
        LlmProvider::Local(local) => call_local_completions_structured(local, prompt, system).await,
        _ => provider.call_structured(prompt, system, Some(0.7)).await,
    }
}
