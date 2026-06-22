use serde::{Deserialize, Serialize};

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
