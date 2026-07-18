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
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
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
    async fn execute_request(&self, prompt: &str, system: Option<&str>, json_mode: bool, temperature: Option<f32>) -> Result<String, String> {
        let system_instruction = system.map(|sys| GeminiSystemInstruction {
            parts: vec![GeminiPart { text: sys.to_string() }],
        });

        let generation_config = if json_mode || temperature.is_some() {
            Some(GeminiGenerationConfig {
                response_mime_type: if json_mode { Some("application/json".to_string()) } else { None },
                temperature,
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

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        self.execute_request(prompt, system, false, temperature).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        self.execute_request(prompt, system, true, temperature).await
    }

    /// Transcribes audio via Gemini's multimodal `generateContent` endpoint —
    /// Gemini has no separate transcription endpoint, so this sends the audio
    /// as an `inlineData` part alongside a text instruction. `audio_base64` is
    /// the already-base64-encoded audio bytes. Reuses `GeminiResponseBody` and
    /// friends for response parsing since the response shape is identical to
    /// the text-only calls above; the request body is built as a raw JSON
    /// value instead of reusing `GeminiPart`/`GeminiContent`, since a part is
    /// either `{text}` or `{inlineData}`, not both, which doesn't map cleanly
    /// onto the existing text-only request structs.
    pub async fn transcribe(&self, audio_base64: &str, mime_type: &str, language_hint: Option<&str>) -> Result<String, String> {
        let instruction = match language_hint {
            Some(lang) if lang != "auto" => format!(
                "Transcribe this audio exactly as spoken, in {}. Return only the transcript text, no commentary, no formatting.",
                lang
            ),
            _ => "Transcribe this audio exactly as spoken. Return only the transcript text, no commentary, no formatting.".to_string(),
        };

        let body = serde_json::json!({
            "contents": [{
                "parts": [
                    { "inlineData": { "mimeType": mime_type, "data": audio_base64 } },
                    { "text": instruction }
                ]
            }]
        });

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
            .map_err(|e| format!("Gemini transcription request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Gemini transcription error {status}: {body}"));
        }

        let resp: GeminiResponseBody = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Gemini transcription response: {e}"))?;

        let text = resp
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|cand| cand.content)
            .and_then(|cont| cont.parts)
            .and_then(|parts| parts.into_iter().next())
            .and_then(|part| part.text)
            .ok_or_else(|| "Gemini transcription response missing text".to_string())?;

        Ok(text.trim().to_string())
    }
}
