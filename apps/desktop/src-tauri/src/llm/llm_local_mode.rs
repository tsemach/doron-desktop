use std::sync::{Mutex, OnceLock};
use serde::Serialize;
use tauri::{AppHandle, Manager, Emitter};

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

    // Prevent system sleep during download
    let _guard = crate::power::SleepPreventionGuard::new(false);

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
            let client = reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .redirect(reqwest::redirect::Policy::none()) // Handle redirects manually
                .build()
                .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

            let mut current_size = std::fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);

            // To prevent corruption from partially-written or zero-padded blocks when the app was closed abruptly,
            // we backtrack and truncate the temporary file by a safe margin of 2MB and resume from there.
            let safe_margin = 2 * 1024 * 1024; // 2MB
            if current_size > safe_margin {
                current_size -= safe_margin;
                if let Ok(file) = std::fs::OpenOptions::new().write(true).open(&temp_path) {
                    let _ = file.set_len(current_size);
                }
            } else {
                current_size = 0;
            }

            let mut current_url = url.to_string();
            let mut expected_sha256 = None;
            let mut response = loop {
                let mut req = client.get(&current_url);
                if current_size > 0 {
                    req = req.header(reqwest::header::RANGE, format!("bytes={}-", current_size));
                }

                let resp = req.send().await
                    .map_err(|e| format!("Failed to connect to model host: {}", e))?;

                // Extract expected SHA256 from x-linked-etag or etag in any response header
                if let Some(x_etag) = resp.headers().get("x-linked-etag") {
                    let etag_str = x_etag.to_str().unwrap_or("").trim_matches('"');
                    if etag_str.len() == 64 && etag_str.chars().all(|c| c.is_ascii_hexdigit()) {
                        expected_sha256 = Some(etag_str.to_string());
                    }
                }
                if expected_sha256.is_none() {
                    if let Some(etag_header) = resp.headers().get("etag") {
                        let etag_str = etag_header.to_str().unwrap_or("").trim_matches('"');
                        if etag_str.len() == 64 && etag_str.chars().all(|c| c.is_ascii_hexdigit()) {
                            expected_sha256 = Some(etag_str.to_string());
                        }
                    }
                }

                if resp.status().is_redirection() {
                    if let Some(location) = resp.headers().get(reqwest::header::LOCATION) {
                        current_url = location.to_str()
                            .map_err(|e| format!("Invalid redirect URI: {}", e))?.to_string();
                        continue;
                    }
                }
                break resp;
            };

            // If the range was invalid or out of bounds (e.g. server range error), delete the file and start over
            if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                let _ = std::fs::remove_file(&temp_path);
                current_size = 0;
                current_url = url.to_string();
                response = loop {
                    let resp = client.get(&current_url).send().await
                        .map_err(|e| format!("Failed to connect to model host: {}", e))?;
                    if resp.status().is_redirection() {
                        if let Some(location) = resp.headers().get(reqwest::header::LOCATION) {
                            current_url = location.to_str()
                                .map_err(|e| format!("Invalid redirect URI: {}", e))?.to_string();
                            continue;
                        }
                    }
                    break resp;
                };
            }

            if !response.status().is_success() {
                return Err(format!(
                    "Model host returned error status: {} ({})",
                    response.status().as_u16(),
                    response.status().canonical_reason().unwrap_or("Unknown Error")
                ));
            }

            // Determine total file size
            let total_size = if response.status() == reqwest::StatusCode::PARTIAL_CONTENT {
                let parsed_total = if let Some(content_range) = response.headers().get(reqwest::header::CONTENT_RANGE) {
                    let range_str = content_range.to_str().unwrap_or("");
                    if let Some(slash_idx) = range_str.rfind('/') {
                        range_str[slash_idx + 1..].parse::<u64>().ok()
                    } else {
                        None
                    }
                } else {
                    None
                };
                parsed_total.or_else(|| {
                    response.content_length().map(|len| len + current_size)
                })
            } else {
                current_size = 0; // Server returned 200 OK, full file is being sent from 0
                response.content_length()
            };

            let total_size = total_size.ok_or_else(|| "Failed to get model file size".to_string())?;

            // Open the file in the correct mode (append if partial content, create if starting over)
            let mut file = if current_size > 0 {
                std::fs::OpenOptions::new()
                    .write(true)
                    .append(true)
                    .open(&temp_path)
                    .map_err(|e| format!("Failed to open temporary file for appending: {}", e))?
            } else {
                std::fs::File::create(&temp_path)
                    .map_err(|e| format!("Failed to create temporary file: {}", e))?
            };

            let mut downloaded: u64 = current_size;
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

            // Drop write handle to close the file and flush all pending buffers to disk on Windows
            drop(file);

            std::fs::rename(&temp_path, &dest_path)
                .map_err(|e| format!("Failed to finalize model file: {}", e))?;

            if let Some(ref expected_hex) = expected_sha256 {
                let is_valid = verify_file_sha256(&dest_path, expected_hex)?;
                if !is_valid {
                    let _ = std::fs::remove_file(&dest_path);
                    return Err("Downloaded model file checksum validation failed (SHA256 mismatch).".to_string());
                }
            }

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
    if let Ok(running_guard) = super::llm_settings::RUNNING_MODEL.lock() {
        if let Some(ref name) = *running_guard {
            if name == &model_name {
                drop(running_guard); // Release lock before stopping
                super::llm_settings::stop_llama_server();
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

fn verify_file_sha256(path: &std::path::Path, expected_hex: &str) -> Result<bool, String> {
    use sha2::{Sha256, Digest};
    use std::io::Read;

    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open file for checksum: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 64 * 1024]; // 64KB chunks
    loop {
        let count = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file for checksum: {}", e))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let result = hasher.finalize();
    let hex_result = format!("{:x}", result);
    Ok(hex_result == expected_hex)
}
