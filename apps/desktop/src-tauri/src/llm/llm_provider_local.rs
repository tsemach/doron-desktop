use serde::{Deserialize, Serialize};

pub struct LocalProvider {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Serialize)]
struct LocalMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct LocalResponseFormat {
    #[serde(rename = "type")]
    format_type: String, // "json_object"
}

#[derive(Serialize)]
struct LocalRequestBody {
    model: String,
    messages: Vec<LocalMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<LocalResponseFormat>,
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct LocalChoiceMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct LocalChoice {
    message: Option<LocalChoiceMessage>,
}

#[derive(Deserialize)]
struct LocalResponseBody {
    choices: Option<Vec<LocalChoice>>,
}

impl LocalProvider {
    async fn execute_request(&self, prompt: &str, system: Option<&str>, json_mode: bool, temperature: Option<f32>) -> Result<String, String> {
        let mut messages = Vec::new();
        if let Some(sys) = system {
            messages.push(LocalMessage {
                role: "system".to_string(),
                content: sys.to_string(),
            });
        }
        messages.push(LocalMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        });

        let response_format = if json_mode {
            Some(LocalResponseFormat {
                format_type: "json_object".to_string(),
            })
        } else {
            None
        };

        let body = LocalRequestBody {
            model: self.model.clone(),
            messages,
            response_format,
            max_tokens: Some(2048),
            temperature,
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        let base_url = self.base_url.as_deref().unwrap_or("http://localhost:10086/v1");
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
            .map_err(|e| format!("Local model API request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Local model API error {status}: {body}"));
        }

        let resp: LocalResponseBody = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse local model response: {e}"))?;

        let text = resp
            .choices
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.message)
            .and_then(|m| m.content)
            .unwrap_or_default();

        Ok(text)
    }

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        self.execute_request(prompt, system, false, temperature).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        self.execute_request(prompt, system, true, temperature).await
    }
}
