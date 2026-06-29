use std::path::PathBuf;

pub struct SidecarGuard {
    pub child: Option<std::process::Child>,
}

impl Drop for SidecarGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            println!("Shutting down local model sidecar...");
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn get_cli_sidecar_path() -> Result<PathBuf, String> {
    let target = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("macos", "aarch64") => "aarch64-apple-darwin",
        _ => return Err("Unsupported platform for local sidecar".to_string()),
    };
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let sidecar_filename = format!("llama-server-{}{}", target, suffix);

    // Try relative paths in development environment first
    let paths_to_try = vec![
        std::env::current_dir()
            .unwrap_or_default()
            .join("apps/desktop/src-tauri/bin")
            .join(&sidecar_filename),
        std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri/bin")
            .join(&sidecar_filename),
        std::env::current_exe()
            .unwrap_or_default()
            .parent()
            .unwrap_or(&PathBuf::from("."))
            .join(&sidecar_filename),
    ];

    for path in paths_to_try {
        if path.exists() {
            return Ok(path);
        }
    }
    Err(format!(
        "Could not locate sidecar binary: {}. Please make sure you have compiled the application or placed the sidecar in src-tauri/bin.",
        sidecar_filename
    ))
}
