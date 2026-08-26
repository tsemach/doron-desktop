use tauri::AppHandle;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::store;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiConfig {
    pub ai_mode: String,       // "online" | "byom" ("local" is a legacy value from pre-existing installs, no longer selectable)
    pub provider: String,      // "gemini" | "openai" | "anthropic" | "other"
    pub ai_model: String,      // e.g. "gpt-4o-mini", "gemini-1.5-flash", etc.
    pub api_key_enc: String,   // Encrypted API key (saved for BYOM)
    // Independent of ai_mode — voice input's own transcription engine choice.
    // Defaulted so existing callers (e.g. check_ai_health) that don't send this
    // field still deserialize without needing to be updated.
    #[serde(default = "default_voice_engine")]
    pub voice_engine: String,  // "cloud" ("local" is a legacy value from pre-existing installs, no longer selectable)
    // Legacy field from the removed local whisper engine, kept for
    // backward-compatible deserialization of pre-existing saved settings.
    #[serde(default = "default_voice_model")]
    pub voice_model: String,
    // Cloud provider + API key dedicated to voice input (used for BOTH
    // transcription and field extraction when voice_engine == "cloud"),
    // independent of `provider`/`api_key_enc` above.
    #[serde(default = "default_voice_cloud_provider")]
    pub voice_cloud_provider: String, // "gemini" | "openai"
    #[serde(default)]
    pub voice_cloud_api_key: String,
    #[serde(default = "default_voice_cloud_model")]
    pub voice_cloud_model: String,
}

fn default_voice_engine() -> String {
    "cloud".to_string()
}

fn default_voice_model() -> String {
    "whisper multilingual (small)".to_string()
}

fn default_voice_cloud_provider() -> String {
    "gemini".to_string()
}

fn default_voice_cloud_model() -> String {
    "gemini-3.5-flash".to_string()
}

/// Tauri command to load current AI settings
#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> Result<Option<AiConfig>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT ai_mode, provider, ai_model, api_key_enc, voice_engine, voice_model, voice_cloud_provider, voice_cloud_api_key, voice_cloud_model FROM ai_configurations LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(AiConfig {
            ai_mode: r.get(0)?,
            provider: r.get(1)?,
            ai_model: r.get(2)?,
            api_key_enc: r.get(3).unwrap_or_default(),
            voice_engine: r.get(4).unwrap_or_else(|_| default_voice_engine()),
            voice_model: r.get(5).unwrap_or_else(|_| default_voice_model()),
            voice_cloud_provider: r.get(6).unwrap_or_else(|_| default_voice_cloud_provider()),
            voice_cloud_api_key: r.get(7).unwrap_or_default(),
            voice_cloud_model: r.get(8).unwrap_or_else(|_| default_voice_cloud_model()),
        })
    });

    match row {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Tauri command to save AI settings
#[tauri::command]
pub fn save_ai_settings(app: AppHandle, config: AiConfig) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    conn.execute("DELETE FROM ai_configurations", []).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ai_configurations (ai_mode, provider, ai_model, api_key_enc, voice_engine, voice_model, voice_cloud_provider, voice_cloud_api_key, voice_cloud_model) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![config.ai_mode, config.provider, config.ai_model, config.api_key_enc, config.voice_engine, config.voice_model, config.voice_cloud_provider, config.voice_cloud_api_key, config.voice_cloud_model],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Internal helper for other background tasks (like email classification or indexing)
pub fn get_ai_settings_internal(app: &AppHandle) -> Option<AiConfig> {
    let conn = store::open_db(app).ok()?;
    let mut stmt = conn
        .prepare("SELECT ai_mode, provider, ai_model, api_key_enc, voice_engine, voice_model, voice_cloud_provider, voice_cloud_api_key, voice_cloud_model FROM ai_configurations LIMIT 1")
        .ok()?;

    stmt.query_row([], |r| {
        Ok(AiConfig {
            ai_mode: r.get(0)?,
            provider: r.get(1)?,
            ai_model: r.get(2)?,
            api_key_enc: r.get(3).unwrap_or_default(),
            voice_engine: r.get(4).unwrap_or_else(|_| default_voice_engine()),
            voice_model: r.get(5).unwrap_or_else(|_| default_voice_model()),
            voice_cloud_provider: r.get(6).unwrap_or_else(|_| default_voice_cloud_provider()),
            voice_cloud_api_key: r.get(7).unwrap_or_default(),
            voice_cloud_model: r.get(8).unwrap_or_else(|_| default_voice_cloud_model()),
        })
    }).ok()
}

/// `purpose` is threaded through to `ai_requests.purpose` (only meaningful
/// for the online-mode branch below, which is the only path that actually
/// talks to the backend) -- callers pass a literal describing what they're
/// using the provider for ("doc_indexing", "query_analysis", etc.), so
/// backend-side observability isn't just "chat" for every call.
pub fn load_active_provider(
    app: &AppHandle,
    api_key_fallback: String,
    model_fallback: Option<String>,
    purpose: &'static str,
) -> Result<super::llm_provider::LlmProvider, String> {
    let existing_config = get_ai_settings_internal(app);

    // Checked before the generic fallback below -- "online" now proxies
    // through the backend instead of resolving a direct-provider
    // ProviderConfig. "byom" and an unset config fall through to the
    // generic branch completely unchanged.
    if let Some(config) = &existing_config {
        if config.ai_mode == "online" {
            let backend_url = crate::auth::get_backend_url(app)
                .ok_or_else(|| "Sign in to use Cloud AI.".to_string())?;
            let session_token = crate::auth::get_session_token(app)
                .ok_or_else(|| "Sign in to use Cloud AI.".to_string())?;
            let model = super::llm_provider::normalize_model_name(&config.ai_model);
            return Ok(super::llm_provider::LlmProvider::BackendOnline(
                super::llm_provider::BackendOnlineProvider {
                    backend_url,
                    session_token,
                    provider: config.provider.clone(),
                    model,
                    purpose,
                },
            ));
        }
    }

    let config = match existing_config {
        Some(config) => {
            let api_key = if config.api_key_enc.is_empty() {
                api_key_fallback
            } else {
                config.api_key_enc
            };
            super::llm_provider::ProviderConfig {
                provider_type: config.provider,
                api_key,
                model: config.ai_model,
                base_url: None,
            }
        }
        None => {
            let model = model_fallback.unwrap_or_else(|| "claude-3-5-sonnet-20241022".to_string());
            let provider_type = if model.contains("gemini") {
                "gemini".to_string()
            } else if model.contains("gpt") {
                "openai".to_string()
            } else {
                "claude".to_string()
            };
            super::llm_provider::ProviderConfig {
                provider_type,
                api_key: api_key_fallback,
                model,
                base_url: None,
            }
        }
    };

    Ok(super::llm_provider::get_active_provider(config))
}

/// Pure branch decision behind resolve_voice_provider, factored out so it's
/// unit-testable without a real AppHandle -- this crate has no existing
/// mock-AppHandle test infrastructure (confirmed: no `tauri::test` feature
/// enabled, no fixture elsewhere in the codebase), and adding one just for
/// this single decision would be disproportionate. An empty API key means
/// "online" -- there's nothing for BYOM to use; a non-empty key means
/// "BYOM". Mirrors an existing convention: SettingVoiceEngine.tsx's
/// hasAutoOpenedRef effect already treats "key present" as the mode signal
/// for the settings panel's visual state, this just makes it real for the
/// transcription/extraction call path too.
fn is_voice_byom(api_key: &str) -> bool {
    !api_key.trim().is_empty()
}

/// Resolves voice's cloud engine (independent of the main AI Provider's
/// `ai_mode`) to either a BackendOnline provider (online -- no
/// voice-specific API key configured) or a direct BYOM provider (a key is
/// set), replacing the duplicated `Some(provider_type) => get_active_provider(...)`
/// arm both cloud_transcribe.rs::transcribe_audio_cloud and
/// field_extraction.rs::extract_field_value used before this existed --
/// previously neither call site could ever reach BackendOnline for voice,
/// since they always passed an explicit provider straight to
/// get_active_provider regardless of whether a key was set.
///
/// `purpose` is threaded through (not hardcoded) since the two callers use
/// different ai_requests.purpose values: "voice_transcription" for
/// transcription, "field_extraction" for the extraction step.
pub fn resolve_voice_provider(
    app: &AppHandle,
    provider_type: String,
    api_key: String,
    model: Option<String>,
    purpose: &'static str,
) -> Result<super::llm_provider::LlmProvider, String> {
    if is_voice_byom(&api_key) {
        return Ok(super::llm_provider::get_active_provider(super::llm_provider::ProviderConfig {
            provider_type,
            api_key,
            model: model.unwrap_or_default(),
            base_url: None,
        }));
    }

    let backend_url = crate::auth::get_backend_url(app)
        .ok_or_else(|| "Sign in to use Cloud AI.".to_string())?;
    let session_token = crate::auth::get_session_token(app)
        .ok_or_else(|| "Sign in to use Cloud AI.".to_string())?;
    let resolved_model = super::llm_provider::normalize_model_name(&model.unwrap_or_default());
    Ok(super::llm_provider::LlmProvider::BackendOnline(
        super::llm_provider::BackendOnlineProvider {
            backend_url,
            session_token,
            provider: provider_type,
            model: resolved_model,
            purpose,
        },
    ))
}

#[cfg(test)]
mod voice_provider_tests {
    use super::is_voice_byom;

    #[test]
    fn test_empty_api_key_resolves_to_online() {
        assert!(!is_voice_byom(""));
    }

    #[test]
    fn test_whitespace_only_api_key_resolves_to_online() {
        assert!(!is_voice_byom("   "));
    }

    #[test]
    fn test_non_empty_api_key_resolves_to_byom() {
        assert!(is_voice_byom("sk-abc123"));
    }
}

/// Tauri command to run the connection test/health check
#[tauri::command]
pub async fn check_ai_health(app: AppHandle, config: AiConfig) -> Result<String, String> {
    // Cloud/BYOM health checks are Pro-only ("ai_features" FeatureKey,
    // PLAN.md Phase 3) -- local mode already returned above, ungated.
    if !crate::auth::is_pro_tier(&app) {
        return Err("Cloud AI is a Pro feature.".to_string());
    }

    // For online, route through the backend proxy like any other online-mode
    // call -- otherwise this health check would keep validating the old
    // direct-provider path even after it's no longer what's actually used.
    // For BYOM, perform a real network/service call directly against the provider.
    let provider = if config.ai_mode == "online" {
        let backend_url = crate::auth::get_backend_url(&app)
            .ok_or_else(|| "Sign in to use Cloud AI.".to_string())?;
        let session_token = crate::auth::get_session_token(&app)
            .ok_or_else(|| "Sign in to use Cloud AI.".to_string())?;
        let model = crate::llm::llm_provider::normalize_model_name(&config.ai_model);
        crate::llm::llm_provider::LlmProvider::BackendOnline(
            crate::llm::llm_provider::BackendOnlineProvider {
                backend_url,
                session_token,
                provider: config.provider.clone(),
                model,
                purpose: "chat",
            },
        )
    } else {
        crate::llm::llm_provider::get_active_provider(
            crate::llm::llm_provider::ProviderConfig {
                provider_type: config.provider.clone(),
                api_key: config.api_key_enc.clone(),
                model: config.ai_model.clone(),
                base_url: None,
            }
        )
    };

    let check_future = provider.call_simple("Perform a brief system check. Reply with exactly the word 'OK'.", None, None);
    match tokio::time::timeout(std::time::Duration::from_secs(10), check_future).await {
        Ok(Ok(res)) => {
            Ok(format!("Connection successful! Response: '{}'", res.trim()))
        }
        Ok(Err(e)) => {
            // BackendOnlineProvider prefixes online-mode failures with a
            // stable code (QUOTA_EXCEEDED:/RATE_LIMITED:/PROVIDER_ERROR:,
            // see llm_provider_backend_online.rs) that the frontend
            // pattern-matches on (SettingAiProvider.tsx's handleHealthCheck).
            // Wrapping it in "Connection failed: " would push that prefix
            // off the front of the string and break the match -- only wrap
            // BYOM/local's raw, uncoded connection errors.
            const KNOWN_CODES: [&str; 3] = ["QUOTA_EXCEEDED:", "RATE_LIMITED:", "PROVIDER_ERROR:"];
            if KNOWN_CODES.iter().any(|code| e.starts_with(code)) {
                Err(e)
            } else {
                Err(format!("Connection failed: {e}"))
            }
        }
        Err(_) => {
            Err("Connection timed out after 10 seconds. The model might still be loading or warming up in memory.".to_string())
        }
    }
}


