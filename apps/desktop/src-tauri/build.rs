use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Check if sidecar llama-server is present for the current target, download if missing
    if let Err(e) = ensure_sidecar_binary() {
        println!(
            "cargo:warning=Failed to check/download sidecar binary: {}",
            e
        );
    }

    // Run normal Tauri build step
    tauri_build::build();
}

fn ensure_sidecar_binary() -> Result<(), String> {
    let target =
        std::env::var("TARGET").map_err(|e| format!("Could not read TARGET env var: {}", e))?;

    let is_windows = target.contains("windows");
    let suffix = if is_windows { ".exe" } else { "" };

    let sidecar_filename = format!("bin/llama-server-{}{}", target, suffix);
    let out_dir = std::env::var("CARGO_MANIFEST_DIR")
        .map_err(|e| format!("Could not read CARGO_MANIFEST_DIR: {}", e))?;

    let dest_path = PathBuf::from(out_dir).join(&sidecar_filename);
    let dest_dir = dest_path.parent().unwrap();
    std::fs::create_dir_all(dest_dir).map_err(|e| format!("Failed to create bin dir: {}", e))?;

    // Create placeholder files to satisfy Tauri's strict glob checks for DLLs and SOs on all build systems
    let placeholder_dll = dest_dir.join("placeholder.dll");
    let placeholder_so = dest_dir.join("placeholder.so");
    if !placeholder_dll.exists() {
        let _ = std::fs::File::create(placeholder_dll);
    }
    if !placeholder_so.exists() {
        let _ = std::fs::File::create(placeholder_so);
    }

    if dest_path.exists() {
        return Ok(());
    }

    // Map targets to precompiled llama.cpp release URLs (tag b9827)
    let url = if target.contains("x86_64-pc-windows") {
        Some("https://github.com/ggml-org/llama.cpp/releases/download/b9827/llama-b9827-bin-win-cpu-x64.zip")
    } else if target.contains("x86_64-unknown-linux") {
        Some("https://github.com/ggml-org/llama.cpp/releases/download/b9827/llama-b9827-bin-ubuntu-x64.tar.gz")
    } else if target.contains("aarch64-apple-darwin") {
        Some("https://github.com/ggml-org/llama.cpp/releases/download/b9827/llama-b9827-bin-macos-arm64.tar.gz")
    } else if target.contains("x86_64-apple-darwin") {
        Some("https://github.com/ggml-org/llama.cpp/releases/download/b9827/llama-b9827-bin-macos-x64.tar.gz")
    } else {
        None
    };

    let url = match url {
        Some(u) => u,
        None => {
            return Err(format!(
                "Unsupported compile target for sidecar: {}",
                target
            ))
        }
    };

    let dest_dir = dest_path.parent().unwrap();
    std::fs::create_dir_all(dest_dir).map_err(|e| format!("Failed to create bin dir: {}", e))?;

    let temp_extracted = dest_dir.join("temp_extracted");

    if is_windows {
        let temp_zip = dest_dir.join("temp_sidecar.zip");
        // Windows: use PowerShell to download, extract, move exe, copy dlls, and clean up
        let script = format!(
            "$ProgressPreference = 'SilentlyContinue'; \
             Invoke-WebRequest -Uri '{}' -OutFile '{}'; \
             Expand-Archive -Path '{}' -DestinationPath '{}' -Force; \
             Get-ChildItem -Path '{}' -Filter 'llama-server.exe' -Recurse | Select-Object -First 1 | Move-Item -Destination '{}' -Force; \
             Get-ChildItem -Path '{}' -Filter '*.dll' -Recurse | Copy-Item -Destination '{}' -Force; \
             Remove-Item -Path '{}' -Force; \
             Remove-Item -Path '{}' -Recurse -Force",
            url,
            temp_zip.to_string_lossy(),
            temp_zip.to_string_lossy(),
            temp_extracted.to_string_lossy(),
            temp_extracted.to_string_lossy(),
            dest_path.to_string_lossy(),
            temp_extracted.to_string_lossy(),
            dest_dir.to_string_lossy(),
            temp_zip.to_string_lossy(),
            temp_extracted.to_string_lossy()
        );

        let status = Command::new("powershell")
            .args(["-Command", &script])
            .status()
            .map_err(|e| format!("Failed to run powershell command: {}", e))?;

        if !status.success() {
            return Err("PowerShell download/extract script failed".to_string());
        }
    } else {
        let temp_tar = dest_dir.join("temp_sidecar.tar.gz");
        // Unix (Linux/macOS): use curl and tar to download, extract, move server binary, copy shared libraries (.so / .dylib), and clean up
        let script = format!(
            "curl -L -o '{}' '{}' && \
             mkdir -p '{}' && \
             tar -xzf '{}' -C '{}' && \
             mv \"$(find '{}' -name 'llama-server' -type f | head -n 1)\" '{}' && \
             find '{}' \\( -name '*.so*' -o -name '*.dylib*' \\) -exec cp -d {{}} '{}' \\; && \
             chmod +x '{}' && \
             rm -f '{}' && \
             rm -rf '{}'",
            temp_tar.to_string_lossy(),
            url,
            temp_extracted.to_string_lossy(),
            temp_tar.to_string_lossy(),
            temp_extracted.to_string_lossy(),
            temp_extracted.to_string_lossy(),
            dest_path.to_string_lossy(),
            temp_extracted.to_string_lossy(),
            dest_dir.to_string_lossy(),
            dest_path.to_string_lossy(),
            temp_tar.to_string_lossy(),
            temp_extracted.to_string_lossy()
        );

        let status = Command::new("sh")
            .args(["-c", &script])
            .status()
            .map_err(|e| format!("Failed to run shell script: {}", e))?;

        if !status.success() {
            return Err("Unix shell download/extract script failed".to_string());
        }
    }

    println!(
        "cargo:warning=Sidecar binary successfully downloaded and placed at {:?}",
        dest_path
    );
    Ok(())
}
