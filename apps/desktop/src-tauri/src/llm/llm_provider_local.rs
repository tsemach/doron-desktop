use serde::{Deserialize, Serialize};

pub struct LocalProvider {
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Serialize)]
struct LocalRequestBody {
    model: String,
    prompt: String,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct LocalChoice {
    text: String,
}

#[derive(Deserialize)]
struct LocalResponseBody {
    choices: Vec<LocalChoice>,
}

impl LocalProvider {
    async fn execute_request(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        let full_prompt = if let Some(sys) = system {
            format!("System: {}\n\nUser: {}\n\nAssistant:", sys, prompt)
        } else {
            format!("User: {}\n\nAssistant:", prompt)
        };

        let body = LocalRequestBody {
            model: self.model.clone(),
            prompt: full_prompt,
            max_tokens: 2048,
        };

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        let base_url = self.base_url.as_deref().unwrap_or("http://localhost:10086/v1");
        let url = format!("{}/completions", base_url);
        
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
            .into_iter()
            .next()
            .map(|c| c.text)
            .unwrap_or_default();

        Ok(text)
    }

    pub async fn call_simple(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        self.execute_request(prompt, system).await
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>) -> Result<String, String> {
        let system_prompt = match system {
            Some(sys) => format!("{}\n\nIMPORTANT: Your response must be valid JSON.", sys),
            None => "IMPORTANT: Your response must be valid JSON.".to_string()
        };
        self.execute_request(prompt, Some(&system_prompt)).await
    }
}
