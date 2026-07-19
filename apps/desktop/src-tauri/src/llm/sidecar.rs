use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Generic lifecycle manager for an external sidecar HTTP server process
/// (llama-server, whisper-server, ...). One static instance per binary type —
/// this only handles process spawn/kill/liveness mechanics; "which model is
/// currently loaded" stays the caller's concern (mirrors each binary's own
/// `RUNNING_MODEL`-style static), since that's business logic, not sidecar
/// plumbing.
pub struct SidecarManager {
    process: Mutex<Option<std::process::Child>>,
}

impl SidecarManager {
    pub const fn new() -> Self {
        Self { process: Mutex::new(None) }
    }

    pub fn is_running(&self) -> bool {
        let mut guard = self.process.lock().unwrap();
        if let Some(ref mut child) = *guard {
            child.try_wait().map(|status| status.is_none()).unwrap_or(false)
        } else {
            false
        }
    }

    /// Kills the tracked child process (if any) and any zombie OS-level
    /// processes matching `sidecar_filename`, waiting briefly on non-Windows
    /// for the OS to release the port/socket.
    pub fn kill_existing(&self, sidecar_filename: &str) {
        {
            let mut guard = self.process.lock().unwrap();
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        if cfg!(windows) {
            let _ = std::process::Command::new("taskkill")
                .args(&["/F", "/IM", sidecar_filename])
                .status();
        } else {
            let _ = std::process::Command::new("pkill")
                .args(&["-9", "-f", sidecar_filename])
                .status();
            // Give the OS kernel a brief moment (1000ms) to clean up port/socket bindings
            std::thread::sleep(std::time::Duration::from_millis(1000));
        }
    }

    /// Spawns `binary_path` with `args`, redirecting stdout/stderr to
    /// `log_file_path`, and tracks it as the currently-running process.
    pub fn spawn(
        &self,
        binary_path: &std::path::Path,
        args: &[String],
        log_file_path: &std::path::Path,
    ) -> Result<(), String> {
        let mut cmd = std::process::Command::new(binary_path);
        cmd.args(args);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(log_file_path)
            .map_err(|e| format!("Failed to create log file {:?}: {}", log_file_path, e))?;

        cmd.stdout(log_file.try_clone().map_err(|e| e.to_string())?);
        cmd.stderr(log_file);

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
        *self.process.lock().unwrap() = Some(child);
        Ok(())
    }

    pub fn stop(&self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Resolves a sidecar binary's path, checking dev-environment relative paths
/// first, then falling back to Tauri's bundled resource resolution.
/// `binary_base_name` is the sidecar's name without target-triple/extension
/// suffix (e.g. "llama-server", "whisper-server").
pub fn get_sidecar_path(app: &AppHandle, binary_base_name: &str) -> Result<std::path::PathBuf, String> {
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        _ => return Err("Unsupported platform for local model execution".to_string()),
    };
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let sidecar_filename = format!("{}-{}{}", binary_base_name, target, suffix);

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
