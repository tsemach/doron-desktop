use serde::{Deserialize, Serialize};

pub struct ClaudeProvider {
    pub api_key: String,
    pub model: String,
}

#[derive(Serialize)]
struct ClaudeMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ClaudeRequestBody {
    model: String,
    max_tokens: u32,
    messages: Vec<ClaudeMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct ClaudeContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct ClaudeResponseBody {
    content: Vec<ClaudeContentBlock>,
}

impl ClaudeProvider {
    async fn execute_request(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        let body = ClaudeRequestBody {
            model: self.model.clone(),
            max_tokens: 2000,
            messages: vec![ClaudeMessage { role: "user", content: prompt.to_string() }],
            system: system.map(|s| s.to_string()),
            temperature,
        };

        let client = reqwest::Client::new();
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .header("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Claude API request failed: {e:?}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Claude API error {status}: {body}"));
        }

        let resp: ClaudeResponseBody = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Claude response: {e}"))?;

        Ok(resp.content.into_iter().next().map(|b| b.text).unwrap_or_default())
    }

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        self.execute_request(prompt, system, temperature).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        let system_prompt = match system {
            Some(sys) => format!("{}\n\nIMPORTANT: Your response must be ONLY valid JSON. Do not include markdown code fences or explanatory text. Start directly with {{ and end with }}.", sys),
            None => "IMPORTANT: Your response must be ONLY valid JSON. Do not include markdown code fences or explanatory text. Start directly with { and end with }.".to_string()
        };
        self.execute_request(prompt, Some(&system_prompt), temperature).await
    }
}
