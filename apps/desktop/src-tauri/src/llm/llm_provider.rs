#[path = "llm_provider_gemini.rs"]
pub mod llm_provider_gemini;
#[path = "llm_provider_openai.rs"]
pub mod llm_provider_openai;
#[path = "llm_provider_entropic.rs"]
pub mod llm_provider_entropic;
#[path = "llm_provider_mock.rs"]
pub mod llm_provider_mock;
#[path = "llm_provider_local.rs"]
pub mod llm_provider_local;

pub use llm_provider_gemini::GeminiProvider;
pub use llm_provider_openai::OpenAiProvider;
pub use llm_provider_entropic::ClaudeProvider;
pub use llm_provider_mock::MockProvider;
pub use llm_provider_local::LocalProvider;

pub enum LlmProvider {
    Claude(ClaudeProvider),
    Gemini(GeminiProvider),
    OpenAi(OpenAiProvider),
    Mock(MockProvider),
    Local(LocalProvider),
}

impl LlmProvider {
    pub async fn call_simple(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        match self {
            Self::Claude(p) => p.call_simple(prompt, system, temperature).await,
            Self::Gemini(p) => p.call_simple(prompt, system, temperature).await,
            Self::OpenAi(p) => p.call_simple(prompt, system, temperature).await,
            Self::Mock(p) => p.call_simple(prompt, system, temperature).await,
            Self::Local(p) => p.call_simple(prompt, system, temperature).await,
        }
    }

    pub async fn call_structured(&self, prompt: &str, system: Option<&str>, temperature: Option<f32>) -> Result<String, String> {
        match self {
            Self::Claude(p) => p.call_structured(prompt, system, temperature).await,
            Self::Gemini(p) => p.call_structured(prompt, system, temperature).await,
            Self::OpenAi(p) => p.call_structured(prompt, system, temperature).await,
            Self::Mock(p) => p.call_structured(prompt, system, temperature).await,
            Self::Local(p) => p.call_structured(prompt, system, temperature).await,
        }
    }
}

pub struct ProviderConfig {
    pub provider_type: String, // "claude" | "gemini" | "openai" | "local" | "byom" | "mock"
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

fn normalize_model_name(model: &str) -> String {
    match model {
        "claude-3-5-sonnet-online" => "claude-3-5-sonnet-20241022".to_string(),
        "claude-3-5-opus-online" => "claude-3-opus-20240229".to_string(),
        "gemini-1.5-pro-online" => "gemini-1.5-pro".to_string(),
        "gpt-4o-online" => "gpt-4o".to_string(),
        other => other.to_string(),
    }
}

pub fn get_active_provider(config: ProviderConfig) -> LlmProvider {
    let model = normalize_model_name(&config.model);
    match config.provider_type.to_lowercase().as_str() {
        "gemini" => LlmProvider::Gemini(GeminiProvider {
            api_key: config.api_key,
            model: if model.is_empty() { "gemini-1.5-flash".to_string() } else { model },
        }),
        "openai" => LlmProvider::OpenAi(OpenAiProvider {
            api_key: config.api_key,
            model: if model.is_empty() { "gpt-4o-mini".to_string() } else { model },
            base_url: config.base_url,
        }),
        "local" | "ollama" => LlmProvider::Local(LocalProvider {
            api_key: config.api_key,
            model: if model.is_empty() { "phi-4".to_string() } else { model },
            base_url: Some(config.base_url.unwrap_or_else(|| "http://localhost:10086/v1".to_string())),
        }),
        "byom" => LlmProvider::OpenAi(OpenAiProvider {
            api_key: config.api_key,
            model: model,
            base_url: config.base_url,
        }),
        "mock" => LlmProvider::Mock(MockProvider),
        _ => LlmProvider::Claude(ClaudeProvider {
            api_key: config.api_key,
            model: if model.is_empty() { "claude-3-5-sonnet-20241022".to_string() } else { model },
        }),
    }
}
