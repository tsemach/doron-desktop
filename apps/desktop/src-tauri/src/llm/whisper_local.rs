use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use super::llm_local_mode::get_model_filename;
use super::sidecar::{SidecarManager, get_sidecar_path};

static WHISPER_SIDECAR: SidecarManager = SidecarManager::new();
static RUNNING_WHISPER_MODEL: Mutex<Option<String>> = Mutex::new(None);

// Distinct from llama-server's port (10086) so both sidecars can run concurrently.
const WHISPER_PORT: u16 = 10087;

fn start_whisper_server(app: &AppHandle, model_name: &str) -> Result<u16, String> {
    let sidecar_path = get_sidecar_path(app, "whisper-server")?;
    let model_file = get_model_filename(model_name)?;
    let models_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    let model_path = models_dir.join(model_file);
    if !model_path.exists() {
        return Err("Whisper model file not found. Please download it first.".to_string());
    }

    let mut model_guard = RUNNING_WHISPER_MODEL.lock().unwrap();

    if WHISPER_SIDECAR.is_running() && model_guard.as_deref() == Some(model_name) {
        return Ok(WHISPER_PORT);
    }

    let sidecar_filename = sidecar_path.file_name().unwrap().to_string_lossy().into_owned();
    WHISPER_SIDECAR.kill_existing(&sidecar_filename);
    *model_guard = None;

    let args: Vec<String> = vec![
        "-m".into(), model_path.to_string_lossy().into_owned(),
        "--port".into(), WHISPER_PORT.to_string(),
        "--host".into(), "127.0.0.1".into(),
    ];

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let log_file_path = app_data_dir.join("whisper_sidecar.log");

    WHISPER_SIDECAR.spawn(&sidecar_path, &args, &log_file_path)?;
    *model_guard = Some(model_name.to_string());

    Ok(WHISPER_PORT)
}

#[tauri::command]
pub fn stop_whisper_server() {
    WHISPER_SIDECAR.stop();
    if let Ok(mut model_guard) = RUNNING_WHISPER_MODEL.lock() {
        *model_guard = None;
    }
}

/// Transcribes audio via the local whisper-server sidecar's `/inference`
/// endpoint. `audio_bytes` must already be 16kHz mono PCM WAV — conversion
/// from whatever format the browser recorded happens client-side (see
/// lib/audioConversion.ts) so this command, and whisper-server itself, never
/// need an FFmpeg dependency.
#[tauri::command]
pub async fn transcribe_audio_local(
    app: AppHandle,
    audio_bytes: Vec<u8>,
    model_name: String,
    language: Option<String>,
) -> Result<String, String> {
    let port = start_whisper_server(&app, &model_name)?;
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/inference", port);

    // Give the sidecar a moment to finish loading the model into memory before
    // the first request, then retry briefly if it's not ready yet.
    let mut last_err = String::new();
    for attempt in 0..20 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }

        let form = reqwest::multipart::Form::new()
            .part(
                "file",
                reqwest::multipart::Part::bytes(audio_bytes.clone())
                    .file_name("audio.wav")
                    .mime_str("audio/wav")
                    .map_err(|e| e.to_string())?,
            )
            .text("response_format", "json")
            .text("language", language.clone().unwrap_or_else(|| "auto".to_string()));

        match client.post(&url).multipart(form).send().await {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
                return json
                    .get("text")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .ok_or_else(|| "whisper-server response missing 'text' field".to_string());
            }
            Ok(resp) => {
                last_err = format!("whisper-server returned status {}", resp.status());
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
    }

    Err(format!("Failed to reach local whisper-server after retries: {}", last_err))
}
