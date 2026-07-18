use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::AppHandle;
use super::llm_provider::LlmProvider;

/// Only Gemini and OpenAI support audio input — Claude, the local text
/// model, and mock all return an explicit "unsupported" error rather than
/// silently failing or producing a garbled result. Split out from the
/// `#[tauri::command]` wrapper (which needs an `AppHandle` to resolve the
/// provider) so this dispatch logic is unit-testable on its own.
async fn transcribe_via_provider(provider: LlmProvider, audio_bytes: Vec<u8>, language: Option<String>) -> Result<String, String> {
    match provider {
        LlmProvider::Gemini(p) => {
            let audio_base64 = STANDARD.encode(&audio_bytes);
            p.transcribe(&audio_base64, "audio/wav", language.as_deref()).await
        }
        LlmProvider::OpenAi(p) => p.transcribe(audio_bytes, language.as_deref()).await,
        LlmProvider::Claude(_) => Err(
            "Voice input isn't supported for Claude. Switch your AI provider to Gemini or OpenAI, or use the local voice engine instead.".to_string(),
        ),
        LlmProvider::Local(_) => Err(
            "Voice input isn't supported for the local text-chat model. Switch your AI provider to Gemini or OpenAI, or use the local voice engine instead.".to_string(),
        ),
        LlmProvider::Mock(_) => Err("Voice input isn't supported in mock mode.".to_string()),
    }
}

/// Transcribes audio via the user's configured cloud AI provider. Resolves
/// the provider the exact same way other commands do (`load_active_provider`,
/// also used by `query_search_documents`), so this stays in sync with
/// whatever the user has configured in Settings without re-deriving that
/// logic here.
#[tauri::command]
pub async fn transcribe_audio_cloud(
    app: AppHandle,
    audio_bytes: Vec<u8>,
    api_key: String,
    model: Option<String>,
    language: Option<String>,
) -> Result<String, String> {
    let provider = super::llm_settings::load_active_provider(&app, api_key, model);
    transcribe_via_provider(provider, audio_bytes, language).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::llm_provider::{ClaudeProvider, MockProvider, LocalProvider};

    #[tokio::test]
    async fn test_claude_returns_explicit_unsupported_error() {
        let provider = LlmProvider::Claude(ClaudeProvider {
            api_key: "unused".to_string(),
            model: "claude-3-5-sonnet-20241022".to_string(),
        });
        let result = transcribe_via_provider(provider, vec![1, 2, 3], None).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Claude"), "expected error to mention Claude, got: {err}");
    }

    #[tokio::test]
    async fn test_mock_returns_explicit_unsupported_error() {
        let provider = LlmProvider::Mock(MockProvider);
        let result = transcribe_via_provider(provider, vec![1, 2, 3], None).await;
        assert_eq!(result, Err("Voice input isn't supported in mock mode.".to_string()));
    }

    #[tokio::test]
    async fn test_local_returns_explicit_unsupported_error() {
        let provider = LlmProvider::Local(LocalProvider {
            api_key: String::new(),
            model: "phi-4".to_string(),
            base_url: Some("http://localhost:10086/v1".to_string()),
        });
        let result = transcribe_via_provider(provider, vec![1, 2, 3], None).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("local text-chat model"));
    }
}
