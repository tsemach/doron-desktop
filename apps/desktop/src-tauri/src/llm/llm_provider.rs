use serde::{Deserialize, Serialize};

pub enum LlmProvider {
    Claude(ClaudeProvider),
    Gemini(GeminiProvider),
    OpenAi(OpenAiProvider),
}

impl LlmProvider {
    pub async fn call_simple(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        match self {
            Self::Claude(p) => p.call_simple(prompt, system).await,
            Self::Gemini(p) => p.call_simple(prompt, system).await,
            Self::OpenAi(p) => p.call_simple(prompt, system).await,
        }
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        match self {
            Self::Claude(p) => p.call_structured(prompt, system).await,
            Self::Gemini(p) => p.call_structured(prompt, system).await,
            Self::OpenAi(p) => p.call_structured(prompt, system).await,
        }
    }
}

pub struct ProviderConfig {
    pub provider_type: String, // "claude" | "gemini" | "openai"
    pub api_key: String,
    pub model: String,
}

pub fn get_active_provider(config: ProviderConfig) -> LlmProvider {
    match config.provider_type.to_lowercase().as_str() {
        "gemini" => LlmProvider::Gemini(GeminiProvider {
            api_key: config.api_key,
            model: if config.model.is_empty() { "gemini-1.5-flash".to_string() } else { config.model },
        }),
        "openai" => LlmProvider::OpenAi(OpenAiProvider {
            api_key: config.api_key,
            model: if config.model.is_empty() { "gpt-4o-mini".to_string() } else { config.model },
        }),
        _ => LlmProvider::Claude(ClaudeProvider {
            api_key: config.api_key,
            model: if config.model.is_empty() { "claude-3-5-sonnet-20241022".to_string() } else { config.model },
        }),
    }
}

// ── Claude Provider Implementation ──────────────────────────────────────────

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
    async fn execute_request(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        let body = ClaudeRequestBody {
            model: self.model.clone(),
            max_tokens: 4096,
            messages: vec![ClaudeMessage { role: "user", content: prompt.to_string() }],
            system: system.map(|s| s.to_string()),
        };

        let client = reqwest::Client::new();
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Claude API request failed: {e}"))?;

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

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        self.execute_request(prompt, system).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        let system_prompt = match system {
            Some(sys) => format!("{}\n\nIMPORTANT: Your response must be ONLY valid JSON. Do not include markdown code fences or explanatory text. Start directly with {{ and end with }}.", sys),
            None => "IMPORTANT: Your response must be ONLY valid JSON. Do not include markdown code fences or explanatory text. Start directly with { and end with }.".to_string()
        };
        self.execute_request(prompt, Some(&system_prompt)).await
    }
}

// ── Gemini Provider Implementation ──────────────────────────────────────────

pub struct GeminiProvider {
    pub api_key: String,
    pub model: String,
}

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiSystemInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeminiRequestBody {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiSystemInstruction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Deserialize)]
struct GeminiCandidateText {
    text: Option<String>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContentResponse>,
}

#[derive(Deserialize)]
struct GeminiContentResponse {
    parts: Option<Vec<GeminiCandidateText>>,
}

#[derive(Deserialize)]
struct GeminiResponseBody {
    candidates: Option<Vec<GeminiCandidate>>,
}

impl GeminiProvider {
    async fn execute_request(&self, prompt: &str, system: Option<&str>, json_mode: bool) -> Result<String, String> {
        let system_instruction = system.map(|sys| GeminiSystemInstruction {
            parts: vec![GeminiPart { text: sys.to_string() }],
        });

        let generation_config = if json_mode {
            Some(GeminiGenerationConfig {
                response_mime_type: Some("application/json".to_string()),
            })
        } else {
            None
        };

        let body = GeminiRequestBody {
            contents: vec![GeminiContent {
                parts: vec![GeminiPart { text: prompt.to_string() }],
            }],
            system_instruction,
            generation_config,
        };

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key
        );

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Gemini API request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Gemini API error {status}: {body}"));
        }

        let resp: GeminiResponseBody = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

        let text = resp
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|cand| cand.content)
            .and_then(|cont| cont.parts)
            .and_then(|parts| parts.into_iter().next())
            .and_then(|part| part.text)
            .unwrap_or_default();

        Ok(text)
    }

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        self.execute_request(prompt, system, false).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        self.execute_request(prompt, system, true).await
    }
}

// ── OpenAI Provider Implementation ──────────────────────────────────────────

pub struct OpenAiProvider {
    pub api_key: String,
    pub model: String,
}

#[derive(Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OpenAiResponseFormat {
    #[serde(rename = "type")]
    format_type: String, // "json_object"
}

#[derive(Serialize)]
struct OpenAiRequestBody {
    model: String,
    messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<OpenAiResponseFormat>,
}

#[derive(Deserialize)]
struct OpenAiChoiceMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: Option<OpenAiChoiceMessage>,
}

#[derive(Deserialize)]
struct OpenAiResponseBody {
    choices: Option<Vec<OpenAiChoice>>,
}

impl OpenAiProvider {
    async fn execute_request(&self, prompt: &str, system: Option<&str>, json_mode: bool) -> Result<String, String> {
        let mut messages = Vec::new();
        if let Some(sys) = system {
            messages.push(OpenAiMessage {
                role: "system".to_string(),
                content: sys.to_string(),
            });
        }
        messages.push(OpenAiMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        });

        let response_format = if json_mode {
            Some(OpenAiResponseFormat {
                format_type: "json_object".to_string(),
            })
        } else {
            None
        };

        let body = OpenAiRequestBody {
            model: self.model.clone(),
            messages,
            response_format,
        };

        let client = reqwest::Client::new();
        let response = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("OpenAI API request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error {status}: {body}"));
        }

        let resp: OpenAiResponseBody = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {e}"))?;

        let text = resp
            .choices
            .and_then(|c| c.into_iter().next())
            .and_then(|choice| choice.message)
            .and_then(|msg| msg.content)
            .unwrap_or_default();

        Ok(text)
    }

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        self.execute_request(prompt, system, false).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        let system_prompt = match system {
            Some(sys) => format!("{}\n\nIMPORTANT: Your response must be valid JSON.", sys),
            None => "IMPORTANT: Your response must be valid JSON.".to_string()
        };
        self.execute_request(prompt, Some(&system_prompt), true).await
    }
}
