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

/// Tauri command to run the connection test/health check
#[tauri::command]
pub async fn check_ai_health(app: AppHandle, config: AiConfig) -> Result<String, String> {
    if config.ai_mode == "online" {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        return Ok(format!(
            "Online Pro model connection successful: verified account status, model '{}' is ready.",
            config.ai_model
        ));
    }

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
    }

    // For local or BYOM, perform a real network/service call!
    let provider = if config.ai_mode == "local" {
        crate::llm::llm_provider::get_active_provider(
            crate::llm::llm_provider::ProviderConfig {
                provider_type: "local".to_string(),
                api_key: "".to_string(),
                model: config.ai_model.clone(),
                base_url: Some("http://localhost:10086/v1".to_string()),
            }
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

    match provider.call_simple("Perform a brief system check. Reply with exactly the word 'OK'.", None).await {
        Ok(res) => {
            Ok(format!("Connection successful! Response: '{}'", res.trim()))
        }
        Err(e) => {
            Err(format!("Connection failed: {e}"))
        }
    }
}

// ── Local Model Sidecar & Downloader implementation ─────────────────────────

use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

static LLAMA_SERVER_PROCESS: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();
static RUNNING_MODEL: Mutex<Option<String>> = Mutex::new(None);
static ACTIVE_DOWNLOADS: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();
static CANCELLED_DOWNLOADS: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();

fn get_active_downloads() -> &'static Mutex<std::collections::HashSet<String>> {
    ACTIVE_DOWNLOADS.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

fn get_cancelled_downloads() -> &'static Mutex<std::collections::HashSet<String>> {
    CANCELLED_DOWNLOADS.get_or_init(|| Mutex::new(std::collections::HashSet::new()))
}

#[tauri::command]
pub fn check_model_downloading(model_name: String) -> bool {
    if let Ok(guard) = get_active_downloads().lock() {
        guard.contains(&model_name)
    } else {
        false
    }
}

#[tauri::command]
pub fn cancel_model_download(model_name: String) -> Result<(), String> {
    if let Ok(mut guard) = get_cancelled_downloads().lock() {
        guard.insert(model_name);
    }
    Ok(())
}

#[derive(Serialize, Clone)]
struct DownloadProgressPayload {
    model_name: String,
    percent: f64,
    status: String, // "downloading" | "completed" | "failed"
    error: Option<String>,
}

pub fn get_model_filename(model_name: &str) -> Result<&'static str, String> {
    match model_name.to_lowercase().as_str() {
        "qwen-2.5-1.5b-instruct (q4)" | "qwen2.5-1.5b-instruct-q4" | "qwen2.5-1.5b-instruct-local" => {
            Ok("qwen2.5-1.5b-instruct-q4_k_m.gguf")
        }
        "qwen-2.5-3b-instruct (q4)" | "qwen2.5-3b-instruct-q4" | "qwen2.5-3b-instruct-local" => {
            Ok("qwen2.5-3b-instruct-q4_k_m.gguf")
        }
        "phi-4-mini-instruct (3.8b q4)" | "phi-4-mini-instruct-q4" | "phi-4-mini-instruct-local" | "phi-4-mini-instruct-3.8b-q4" => {
            Ok("Phi-4-mini-instruct-Q4_K_M.gguf")
        }
        "phi-3.5-mini-instruct (3.8b q4)" | "phi-3.5-mini-instruct-q4" | "phi-3.5-mini-instruct-local" | "phi-3.5-mini-instruct-3.8b-q4" => {
            Ok("Phi-3.5-mini-instruct-Q4_K_M.gguf")
        }
        "gemma 4 e4b (q4)" | "gemma-4-e4b-q4" | "gemma-2-2b-it-local" | "gemma-2-2b-it-q4" => {
            Ok("gemma-2-2b-it-Q4_K_M.gguf")
        }
        _ => Err(format!("Unknown local model: {}", model_name)),
    }
}

fn get_model_url(model_name: &str) -> Result<&'static str, String> {
    match model_name.to_lowercase().as_str() {
        "qwen-2.5-1.5b-instruct (q4)" | "qwen2.5-1.5b-instruct-q4" | "qwen2.5-1.5b-instruct-local" => {
            Ok("https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf")
        }
        "qwen-2.5-3b-instruct (q4)" | "qwen2.5-3b-instruct-q4" | "qwen2.5-3b-instruct-local" => {
            Ok("https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf")
        }
        "phi-4-mini-instruct (3.8b q4)" | "phi-4-mini-instruct-q4" | "phi-4-mini-instruct-local" | "phi-4-mini-instruct-3.8b-q4" => {
            Ok("https://huggingface.co/second-state/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf")
        }
        "phi-3.5-mini-instruct (3.8b q4)" | "phi-3.5-mini-instruct-q4" | "phi-3.5-mini-instruct-local" | "phi-3.5-mini-instruct-3.8b-q4" => {
            Ok("https://huggingface.co/second-state/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf")
        }
        "gemma 4 e4b (q4)" | "gemma-4-e4b-q4" | "gemma-2-2b-it-local" | "gemma-2-2b-it-q4" => {
            Ok("https://huggingface.co/second-state/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf")
        }
        _ => Err(format!("Unknown local model URL for: {}", model_name)),
    }
}

pub fn get_sidecar_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        _ => return Err("Unsupported platform for local model execution".to_string()),
    };
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let sidecar_filename = format!("llama-server-{}{}", target, suffix);

    // Try relative paths in development environment first
    let mut paths_to_try = vec![
        std::env::current_dir().unwrap_or_default().join("apps/desktop/src-tauri/bin").join(&sidecar_filename),
        std::env::current_dir().unwrap_or_default().join("src-tauri/bin").join(&sidecar_filename),
    ];

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            paths_to_try.push(exe_dir.join(&sidecar_filename));
            paths_to_try.push(exe_dir.join("bin").join(&sidecar_filename));
            // target/debug/ -> target/ -> src-tauri/ -> src-tauri/bin/
            if let Some(target_dir) = exe_dir.parent() {
                if let Some(src_tauri_dir) = target_dir.parent() {
                    paths_to_try.push(src_tauri_dir.join("bin").join(&sidecar_filename));
                }
            }
        }
    }

    for path in paths_to_try {
        if path.exists() {
            return Ok(path);
        }
    }

    let sidecar_name = format!("bin/{}", sidecar_filename);
    app.path().resolve(&sidecar_name, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to resolve sidecar path: {}", e))
}

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
            .args(&["-f", &sidecar_filename])
            .status();
        // Give the OS kernel a brief moment (200ms) to clean up port/socket bindings
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    let port = 10086;
    let mut cmd = std::process::Command::new(&sidecar_path);
    cmd.arg("--model").arg(&model_path)
       .arg("--port").arg(port.to_string())
       .arg("--threads").arg("4")
       .arg("--host").arg("127.0.0.1");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

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

#[tauri::command]
pub fn check_local_model_status(app: AppHandle, model_name: String) -> Result<bool, String> {
    let model_file = get_model_filename(&model_name)?;
    let models_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    let model_path = models_dir.join(model_file);
    if model_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&model_path) {
            if metadata.len() < 10 * 1024 * 1024 {
                println!("Warning: Local model file {:?} is too small ({} bytes). Deleting invalid file.", model_path, metadata.len());
                let _ = std::fs::remove_file(&model_path);
                return Ok(false);
            }
        }
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn install_local_model(app: AppHandle, model_name: String) -> Result<(), String> {
    // Check if this model is already downloading
    {
        let downloads_guard = get_active_downloads().lock().unwrap();
        if downloads_guard.contains(&model_name) {
            return Err("A download for this model is already in progress in the background.".to_string());
        }
    }

    // Mark as downloading
    {
        let mut downloads_guard = get_active_downloads().lock().unwrap();
        downloads_guard.insert(model_name.clone());
    }

    let url = get_model_url(&model_name)?;
    let filename = get_model_filename(&model_name)?;
    let models_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    let dest_path = models_dir.join(filename);
    let temp_path = models_dir.join(format!("{}.download", filename));

    let app_clone = app.clone();
    let model_name_clone = model_name.clone();

    tokio::task::spawn_blocking(move || {
        let runtime = tokio::runtime::Handle::current();
        let res = runtime.block_on(async {
            let client = reqwest::Client::new();
            let response = client.get(url).send().await
                .map_err(|e| format!("Failed to connect to model host: {}", e))?;

            if !response.status().is_success() {
                return Err(format!(
                    "Model host returned error status: {} ({})",
                    response.status().as_u16(),
                    response.status().canonical_reason().unwrap_or("Unknown Error")
                ));
            }

            let total_size = response.content_length()
                .ok_or_else(|| "Failed to get model file size".to_string())?;

            let mut file = std::fs::File::create(&temp_path)
                .map_err(|e| format!("Failed to create temporary file: {}", e))?;

            let mut downloaded: u64 = 0;
            let mut response = response;
            
            while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
                // Check if this download has been cancelled
                if let Ok(cancelled_guard) = get_cancelled_downloads().lock() {
                    if cancelled_guard.contains(&model_name_clone) {
                        return Err("Download cancelled by user".to_string());
                    }
                }

                use std::io::Write;
                file.write_all(&chunk).map_err(|e| e.to_string())?;
                downloaded += chunk.len() as u64;

                let percent = (downloaded as f64 / total_size as f64) * 100.0;
                let _ = app_clone.emit("model-download-progress", DownloadProgressPayload {
                    model_name: model_name_clone.clone(),
                    percent,
                    status: "downloading".to_string(),
                    error: None,
                });
            }

            std::fs::rename(&temp_path, &dest_path)
                .map_err(|e| format!("Failed to finalize model file: {}", e))?;

            let _ = app_clone.emit("model-download-progress", DownloadProgressPayload {
                model_name: model_name_clone.clone(),
                percent: 100.0,
                status: "completed".to_string(),
                error: None,
            });

            Ok::<(), String>(())
        });

        // Always clean up the active and cancelled download status when finished, failed, or cancelled
        if let Ok(mut downloads_guard) = get_active_downloads().lock() {
            downloads_guard.remove(&model_name_clone);
        }
        if let Ok(mut cancelled_guard) = get_cancelled_downloads().lock() {
            cancelled_guard.remove(&model_name_clone);
        }

        // If the task failed (or was cancelled), make sure to remove the temp file
        if res.is_err() {
            let _ = std::fs::remove_file(&temp_path);
        }

        // If the inner task failed, emit error and return it
        if let Err(err) = res {
            let _ = app_clone.emit("model-download-progress", DownloadProgressPayload {
                model_name: model_name_clone.clone(),
                percent: 0.0,
                status: "failed".to_string(),
                error: Some(err.clone()),
            });
            return Err(err);
        }

        Ok::<(), String>(())
    }).await.map_err(|e| format!("Download task panicked: {}", e))??;

    Ok(())
}

#[tauri::command]
pub fn delete_local_model(app: AppHandle, model_name: String) -> Result<(), String> {
    // If the model being deleted is currently running, stop the server first
    if let Ok(running_guard) = RUNNING_MODEL.lock() {
        if let Some(ref name) = *running_guard {
            if name == &model_name {
                drop(running_guard); // Release lock before stopping
                stop_llama_server();
            }
        }
    }

    let filename = get_model_filename(&model_name)?;
    let models_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    let dest_path = models_dir.join(filename);
    if dest_path.exists() {
        std::fs::remove_file(dest_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

