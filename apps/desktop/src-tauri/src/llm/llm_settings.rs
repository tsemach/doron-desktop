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
}

/// Tauri command to load current AI settings
#[tauri::command]
pub fn get_ai_settings(app: AppHandle) -> Result<Option<AiConfig>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT ai_mode, provider, ai_model, api_key_enc FROM ai_configurations LIMIT 1")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| {
        Ok(AiConfig {
            ai_mode: r.get(0)?,
            provider: r.get(1)?,
            ai_model: r.get(2)?,
            api_key_enc: r.get(3).unwrap_or_default(),
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
        "INSERT INTO ai_configurations (ai_mode, provider, ai_model, api_key_enc) VALUES (?1, ?2, ?3, ?4)",
        params![config.ai_mode, config.provider, config.ai_model, config.api_key_enc],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Internal helper for other background tasks (like email classification or indexing)
pub fn get_ai_settings_internal(app: &AppHandle) -> Option<AiConfig> {
    let conn = store::open_db(app).ok()?;
    let mut stmt = conn
        .prepare("SELECT ai_mode, provider, ai_model, api_key_enc FROM ai_configurations LIMIT 1")
        .ok()?;

    stmt.query_row([], |r| {
        Ok(AiConfig {
            ai_mode: r.get(0)?,
            provider: r.get(1)?,
            ai_model: r.get(2)?,
            api_key_enc: r.get(3).unwrap_or_default(),
        })
    }).ok()
}

pub fn load_active_provider(
    app: &AppHandle,
    api_key_fallback: String,
    model_fallback: Option<String>,
) -> super::llm_provider::LlmProvider {
    let config = match get_ai_settings_internal(app) {
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

    super::llm_provider::get_active_provider(config)
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

    // For BYOM/online, perform a real network/service call!
    let provider = crate::llm::llm_provider::get_active_provider(
        crate::llm::llm_provider::ProviderConfig {
            provider_type: config.provider.clone(),
            api_key: config.api_key_enc.clone(),
            model: config.ai_model.clone(),
            base_url: None,
        }
    );

    let check_future = provider.call_simple("Perform a brief system check. Reply with exactly the word 'OK'.", None);
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

use std::sync::{Mutex, OnceLock};
use super::llm_local_mode::{get_model_filename, get_sidecar_path};

static LLAMA_SERVER_PROCESS: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();
pub(crate) static RUNNING_MODEL: Mutex<Option<String>> = Mutex::new(None);

pub fn start_llama_server(app: &AppHandle, model_name: &str) -> Result<u16, String> {
    let sidecar_path = get_sidecar_path(app)?;
    let model_file = get_model_filename(model_name)?;
    let models_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    let model_path = models_dir.join(model_file);
    if !model_path.exists() {
        return Err(format!("Model file not found. Please download it first."));
    }

    let mut model_guard = RUNNING_MODEL.lock().unwrap();
    let process_lock = LLAMA_SERVER_PROCESS.get_or_init(|| Mutex::new(None));
    let mut process_guard = process_lock.lock().unwrap();

    // Check if running and is same model
    let is_running = if let Some(ref mut child) = *process_guard {
        child.try_wait().map(|status| status.is_none()).unwrap_or(false)
    } else {
        false
    };

    if is_running && model_guard.as_deref() == Some(model_name) {
        return Ok(10086);
    }

    // Kill existing process
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *model_guard = None;

    // Prior to spawning, kill any zombie sidecar processes of the same name running in the OS
    let sidecar_filename = sidecar_path.file_name().unwrap().to_string_lossy().into_owned();
    if cfg!(windows) {
        let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", &sidecar_filename])
            .status();
    } else {
        let _ = std::process::Command::new("pkill")
            .args(&["-9", "-f", &sidecar_filename])
            .status();
        // Give the OS kernel a brief moment (1000ms) to clean up port/socket bindings
        std::thread::sleep(std::time::Duration::from_millis(1000));
    }

    // Dynamically detect total logical CPU threads and allocate 50% to the Llama server
    let system_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let allocated_threads = (system_threads / 2).max(1);
    println!("Dynamic CPU allocation: using {} out of {} available threads", allocated_threads, system_threads);

    let port = 10086;
    let mut cmd = std::process::Command::new(&sidecar_path);
    cmd.arg("--model").arg(&model_path)
       .arg("--port").arg(port.to_string())
       .arg("--threads").arg(allocated_threads.to_string())
       .arg("--threads-batch").arg(allocated_threads.to_string())
       .arg("-c").arg("8192")
       .arg("--host").arg("127.0.0.1");

    let template = if model_name.to_lowercase().contains("qwen") {
        "chatml"
    } else if model_name.to_lowercase().contains("gemma") {
        "gemma"
    } else if model_name.to_lowercase().contains("phi-4") {
        "phi4"
    } else {
        "chatml"
    };
    cmd.arg("--chat-template").arg(template);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_file_path = app_data_dir.join("llama_sidecar.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_file_path)
        .map_err(|e| format!("Failed to create log file {:?}: {}", log_file_path, e))?;

    cmd.stdout(log_file.try_clone().map_err(|e| e.to_string())?);
    cmd.stderr(log_file);

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
    *process_guard = Some(child);
    *model_guard = Some(model_name.to_string());

    Ok(port)
}

#[tauri::command]
pub fn stop_llama_server() {
    if let Some(lock) = LLAMA_SERVER_PROCESS.get() {
        if let Ok(mut process_guard) = lock.lock() {
            if let Some(mut child) = process_guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    if let Ok(mut model_guard) = RUNNING_MODEL.lock() {
        *model_guard = None;
    }
}


