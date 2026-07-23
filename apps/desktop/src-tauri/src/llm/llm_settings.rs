use tauri::{AppHandle, Manager};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::store;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiConfig {
    pub ai_mode: String,       // "local" | "online" | "byom"
    pub provider: String,      // "gemini" | "openai" | "anthropic" | "other"
    pub ai_model: String,      // e.g. "gpt-4o-mini", "gemini-1.5-flash", etc.
    pub api_key_enc: String,   // Encrypted API key (saved for BYOM)
    // Independent of ai_mode — voice input's own transcription engine choice.
    // Defaulted so existing callers (e.g. check_ai_health) that don't send this
    // field still deserialize without needing to be updated.
    #[serde(default = "default_voice_engine")]
    pub voice_engine: String,  // "local" | "cloud"
    // Which whisper model to use when voice_engine == "local" (see
    // llm_local_mode::get_model_filename's whisper entries).
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
    "local".to_string()
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
        Some(config) if config.ai_mode == "local" => {
            super::llm_provider::ProviderConfig {
                provider_type: "local".to_string(),
                api_key: String::new(),
                model: config.ai_model,
                base_url: Some("http://localhost:10086/v1".to_string()),
            }
        }
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


/// Tauri command to run the connection test/health check
#[tauri::command]
pub async fn check_ai_health(app: AppHandle, config: AiConfig) -> Result<String, String> {
    // For local mode, ensure the background sidecar is started and responsive
    if config.ai_mode == "local" {
        let port = start_llama_server(&app, &config.ai_model)?;
        
        // Poll /health endpoint up to 120 seconds (240 * 500ms) to give the model time to load into memory
        let client = reqwest::Client::new();
        let health_url = format!("http://localhost:{}/health", port);
        let mut responsive = false;
        for _ in 0..240 {
            if client.get(&health_url).send().await.map(|r| r.status().is_success()).unwrap_or(false) {
                responsive = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        
        if !responsive {
            return Err("Local model server failed to start or did not become responsive within timeout.".to_string());
        }
        return Ok("Connection successful! Local model server is running and healthy.".to_string());
    }

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
            Err(format!("Connection failed: {e}"))
        }
        Err(_) => {
            Err("Connection timed out after 10 seconds. The model might still be loading or warming up in memory.".to_string())
        }
    }
}

// ── Local Model Sidecar implementation ───────────────────────────────────────

use std::sync::Mutex;
use super::llm_local_mode::get_model_filename;
use super::sidecar::{SidecarManager, get_sidecar_path};

static LLAMA_SIDECAR: SidecarManager = SidecarManager::new();
pub(crate) static RUNNING_MODEL: Mutex<Option<String>> = Mutex::new(None);

pub fn start_llama_server(app: &AppHandle, model_name: &str) -> Result<u16, String> {
    let sidecar_path = get_sidecar_path(app, "llama-server")?;
    let model_file = get_model_filename(model_name)?;
    let models_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    let model_path = models_dir.join(model_file);
    if !model_path.exists() {
        return Err(format!("Model file not found. Please download it first."));
    }

    let mut model_guard = RUNNING_MODEL.lock().unwrap();

    if LLAMA_SIDECAR.is_running() && model_guard.as_deref() == Some(model_name) {
        return Ok(10086);
    }

    // Prior to spawning, kill any existing/zombie sidecar processes of the same name
    let sidecar_filename = sidecar_path.file_name().unwrap().to_string_lossy().into_owned();
    LLAMA_SIDECAR.kill_existing(&sidecar_filename);
    *model_guard = None;

    // Dynamically detect total logical CPU threads and allocate 50% to the Llama server
    let system_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let allocated_threads = (system_threads / 2).max(1);
    println!("Dynamic CPU allocation: using {} out of {} available threads", allocated_threads, system_threads);

    let port = 10086;
    let template = if model_name.to_lowercase().contains("qwen") {
        "chatml"
    } else if model_name.to_lowercase().contains("gemma") {
        "gemma"
    } else if model_name.to_lowercase().contains("phi-4") {
        "phi4"
    } else {
        "chatml"
    };

    let args: Vec<String> = vec![
        "--model".into(), model_path.to_string_lossy().into_owned(),
        "--port".into(), port.to_string(),
        "--threads".into(), allocated_threads.to_string(),
        "--threads-batch".into(), allocated_threads.to_string(),
        "-c".into(), "8192".into(),
        "--host".into(), "127.0.0.1".into(),
        "--no-cache-prompt".into(),
        "--chat-template".into(), template.into(),
    ];

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_file_path = app_data_dir.join("llama_sidecar.log");

    LLAMA_SIDECAR.spawn(&sidecar_path, &args, &log_file_path)?;
    *model_guard = Some(model_name.to_string());

    Ok(port)
}

#[tauri::command]
pub fn stop_llama_server() {
    LLAMA_SIDECAR.stop();
    if let Ok(mut model_guard) = RUNNING_MODEL.lock() {
        *model_guard = None;
    }
}


