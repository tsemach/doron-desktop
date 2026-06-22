use serde::{Deserialize, Serialize};

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
