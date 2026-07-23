use serde::Serialize;

use crate::llm::backend_stream::{LineBuffer, StreamEvent};

/// Calls the backend's /api/v1/ai/complete route instead of a provider
/// directly -- the desktop's "online" AI mode, now proxied so Amicus holds
/// the only provider credentials (see docs/ai-online-proxy). `byom`/`local`
/// are untouched and keep calling providers directly via the sibling
/// provider structs in this module.
pub struct BackendOnlineProvider {
    pub backend_url: String,
    pub session_token: String,
    pub provider: String,
    pub model: String,
    // Threaded from load_active_provider's/llm_provider_from_app's caller
    // (e.g. "doc_indexing", "query_analysis") into ai_requests.purpose on
    // the backend, so observability isn't just "chat" for every call. Must
    // match one of the enum values in the backend's ai_requests.purpose
    // column (apps/backend/database/schema.ts).
    pub purpose: &'static str,
}

#[derive(Serialize)]
struct CompleteRequestBody<'a> {
    // Token in the body, not an Authorization: Bearer header -- no such
    // convention exists anywhere in this codebase, on either side (see
    // desktop-session/desktop-token routes and route.ts's own auth check).
    token: &'a str,
    prompt: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
    provider: &'a str,
    model: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    structured: Option<bool>,
    purpose: &'a str,
}

impl BackendOnlineProvider {
    async fn stream_and_buffer(&self, prompt: &str, system: Option<&str>, structured: bool) -> Result<String, String> {
        let body = CompleteRequestBody {
            token: &self.session_token,
            prompt,
            system,
            provider: &self.provider,
            model: &self.model,
            structured: structured.then_some(true),
            purpose: self.purpose,
        };

        let client = reqwest::Client::new();
        let mut response = client
            .post(format!("{}/api/v1/ai/complete", self.backend_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("PROVIDER_ERROR: Failed to reach the AI backend: {e}"))?;

        if !response.status().is_success() {
            // A non-2xx here is one of route.ts's pre-flight JSON error
            // responses (401/403/400) -- those never got as far as
            // streaming, so there's no NDJSON envelope to parse.
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("PROVIDER_ERROR: Backend returned {status}: {text}"));
        }

        // .chunk() matches the existing streaming precedent in
        // llm_local_mode.rs's model-download progress loop -- no new
        // Cargo feature needed, reqwest's "stream" feature is not
        // required since .chunk() is already used without it.
        let mut buffer = LineBuffer::default();
        let mut accumulated = String::new();

        while let Some(chunk) = response.chunk().await.map_err(|e| format!("PROVIDER_ERROR: {e}"))? {
            for event in buffer.push(&chunk) {
                match event {
                    Ok(StreamEvent::Delta { text }) => accumulated.push_str(&text),
                    Ok(StreamEvent::Done { .. }) => return Ok(accumulated),
                    Ok(StreamEvent::Error { code, message, .. }) => {
                        // code is already snake_case ("quota_exceeded",
                        // "rate_limited", "provider_error") -- uppercasing
                        // it directly produces exactly the convention
                        // (QUOTA_EXCEEDED:/RATE_LIMITED:/PROVIDER_ERROR:)
                        // Phase 9's frontend pattern-matches on.
                        return Err(format!("{}: {}", code.to_uppercase(), message));
                    }
                    Err(parse_err) => {
                        return Err(format!("PROVIDER_ERROR: Malformed response from backend: {parse_err}"));
                    }
                }
            }
        }

        // The connection closed without ever seeing a 'done' or 'error'
        // line -- route.ts's finally block always closes the stream after
        // emitting one or the other, so this means the connection was
        // truncated (network drop) before the response actually
        // completed. Treat it as a failure rather than silently returning
        // whatever text happened to accumulate, which would misrepresent
        // a truncated response as a complete one.
        Err("PROVIDER_ERROR: Connection closed before the response completed.".to_string())
    }

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>, _temperature: Option<f32>) -> Result<String, String> {
        // The backend route doesn't accept a temperature parameter yet;
        // kept in the signature only for parity with the other providers.
        self.stream_and_buffer(prompt, system, false).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>, _temperature: Option<f32>) -> Result<String, String> {
        self.stream_and_buffer(prompt, system, true).await
    }
}
