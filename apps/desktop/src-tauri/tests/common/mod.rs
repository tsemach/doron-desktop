use std::path::PathBuf;

pub struct SidecarProcessGuard {
    _child: std::process::Child,
}

impl Drop for SidecarProcessGuard {
    fn drop(&mut self) {
        println!("Stopping llama-server sidecar process...");
        let _ = self._child.kill();
        let _ = self._child.wait();
    }
}

pub fn resolve_sidecar_path() -> Result<PathBuf, String> {
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        _ => return Err("Unsupported platform for local model execution".to_string()),
    };
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let sidecar_filename = format!("llama-server-{}{}", target, suffix);

    let paths_to_try = vec![
        std::env::current_dir().unwrap_or_default().join("bin").join(&sidecar_filename),
        std::env::current_dir().unwrap_or_default().join("src-tauri/bin").join(&sidecar_filename),
        std::env::current_dir().unwrap_or_default().join("apps/desktop/src-tauri/bin").join(&sidecar_filename),
    ];

    for path in paths_to_try {
        if path.exists() {
            return Ok(path);
        }
    }
    Err(format!("Could not locate sidecar binary: {}", sidecar_filename))
}

pub async fn start_llama_server_test(model_name: &str, port: u16) -> Result<SidecarProcessGuard, String> {
    let sidecar_path = resolve_sidecar_path()?;
    let model_file = tauri_app_lib::llm::get_model_filename(model_name)?;
    let models_dir = tauri_app_lib::store::cli_app_data_dir().join("models");
    let model_path = models_dir.join(model_file);

    if !model_path.exists() {
        return Err(format!("Model file not found at: {:?}", model_path));
    }

    // Kill any existing llama-server first
    let sidecar_filename = sidecar_path.file_name().unwrap().to_string_lossy().into_owned();
    if cfg!(windows) {
        let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", &sidecar_filename])
            .status();
    } else {
        let _ = std::process::Command::new("pkill")
            .args(&["-9", "-f", &sidecar_filename])
            .status();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    let bin_dir = sidecar_path.parent().unwrap();

    let mut cmd = std::process::Command::new(&sidecar_path);
    cmd.arg("--model").arg(&model_path)
       .arg("--port").arg(port.to_string())
       .arg("--threads").arg("8")
       .arg("-c").arg("8192")
       .arg("--host").arg("127.0.0.1")
       .arg("--no-cache-prompt");

    let log_filename = format!("{}_{}_query_test_server.log", model_name.replace(" ", "_").replace("(", "").replace(")", ""), port);
    let log_path = std::env::current_dir()
        .unwrap_or_default()
        .join("target")
        .join(log_filename);
    
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to create log file: {}", e))?;

    cmd.stdout(log_file.try_clone().map_err(|e| e.to_string())?);
    cmd.stderr(log_file);

    #[cfg(target_os = "linux")]
    {
        cmd.env("LD_LIBRARY_PATH", bin_dir);
    }

    println!("Spawning local sidecar from {:?} on port {} (logs: {:?})", sidecar_path, port, log_path);
    let child = cmd.spawn().map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

    // Poll /health endpoint up to 120 seconds
    let client = reqwest::Client::new();
    let health_url = format!("http://127.0.0.1:{}/health", port);
    let mut responsive = false;
    for _ in 0..240 {
        if client
            .get(&health_url)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            responsive = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    if !responsive {
        let mut child = child;
        let _ = child.kill();
        return Err("Local sidecar failed to become responsive within 120s".to_string());
    }

    println!("Local sidecar is active and ready.");
    Ok(SidecarProcessGuard { _child: child })
}

pub async fn call_with_retry<F, Fut, T>(mut f: F) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let mut last_err = String::new();
    for attempt in 1..=8 {
        match f().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                println!("Attempt {} failed: {}. Retrying in 3 seconds...", attempt, e);
                last_err = e;
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }
        }
    }
    Err(last_err)
}

#[allow(dead_code)]
pub fn setup_test_db(db_path: &std::path::Path) -> rusqlite::Connection {
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
    let conn = rusqlite::Connection::open(db_path).expect("Should open test db");
    tauri_app_lib::store::init_documents_schema(&conn).expect("Schema init should succeed");
    conn
}
