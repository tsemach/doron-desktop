use serde::{Deserialize, Serialize};

pub struct OpenAiProvider {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
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
    async fn execute_request(&self, prompt: &str, system: Option<&str>, json_mode: bool, temperature: Option<f32>) -> Result<String, String> {
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
            max_tokens: None,
            temperature,
        };

        let client = reqwest::Client::new();
        let base_url = self.base_url.as_deref().unwrap_or("https://api.openai.com/v1");
        let url = format!("{}/chat/completions", base_url);
        
        let mut request = client
            .post(&url)
            .header("content-type", "application/json");
            
        if !self.api_key.trim().is_empty() {
            request = request.header("Authorization", format!("Bearer {}", self.api_key));
        }

        let response = request
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

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        self.execute_request(prompt, system, false, temperature).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        let system_prompt = match system {
            Some(sys) => format!("{}\n\nIMPORTANT: Your response must be valid JSON.", sys),
            None => "IMPORTANT: Your response must be valid JSON.".to_string()
        };
        self.execute_request(prompt, Some(&system_prompt), true, temperature).await
    }

    /// Transcribes audio via OpenAI's dedicated `/audio/transcriptions`
    /// endpoint. Uses "whisper-1" regardless of `self.model` — the configured
    /// chat model (e.g. "gpt-4o-mini") isn't necessarily valid for this
    /// endpoint, whereas whisper-1 is the universally-available baseline.
    pub async fn transcribe(&self, audio_bytes: Vec<u8>, language_hint: Option<&str>) -> Result<String, String> {
        let client = reqwest::Client::new();
        let base_url = self.base_url.as_deref().unwrap_or("https://api.openai.com/v1");
        let url = format!("{}/audio/transcriptions", base_url);

        let mut form = reqwest::multipart::Form::new()
            .part(
                "file",
                reqwest::multipart::Part::bytes(audio_bytes)
                    .file_name("audio.wav")
                    .mime_str("audio/wav")
                    .map_err(|e| e.to_string())?,
            )
            .text("model", "whisper-1")
            .text("response_format", "json");

        if let Some(lang) = language_hint {
            if lang != "auto" {
                form = form.text("language", lang.to_string());
            }
        }

        let mut request = client.post(&url);
        if !self.api_key.trim().is_empty() {
            request = request.header("Authorization", format!("Bearer {}", self.api_key));
        }

        let response = request
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("OpenAI transcription request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI transcription error {status}: {body}"));
        }

        #[derive(Deserialize)]
        struct OpenAiTranscriptionResponse {
            text: String,
        }

        let resp: OpenAiTranscriptionResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI transcription response: {e}"))?;

        Ok(resp.text.trim().to_string())
    }
}
