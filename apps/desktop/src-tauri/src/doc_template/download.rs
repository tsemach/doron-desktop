use tauri::AppHandle;
use crate::doc_template::{emit_progress, process_template_internal, TemplateResult};

#[tauri::command]
pub async fn download_and_process_template(
    app: AppHandle,
    url: String,
    file_name: String,
    title: Option<String>,
) -> Result<TemplateResult, String> {
    emit_progress(&app, "processing", &format!("Downloading {}...", file_name));

    // Fetch the file from Vercel Blob store using reqwest
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download template: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download template. Server returned status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read template bytes: {e}"))?;

    // Write bytes to a temporary path
    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(&file_name);
    std::fs::write(&temp_file_path, &bytes)
        .map_err(|e| format!("Failed to write temporary file: {e}"))?;

    let temp_file_path_str = temp_file_path.to_string_lossy().to_string();

    // Call the core processing logic
    let result = process_template_internal(app, temp_file_path_str, None, None, title, false).await;

    // Clean up temporary file
    let _ = std::fs::remove_file(temp_file_path);

    result
}
