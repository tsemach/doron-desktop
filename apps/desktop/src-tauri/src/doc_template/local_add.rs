use tauri::AppHandle;
use crate::doc_template::{process_template_internal, TemplateResult};

#[tauri::command]
#[allow(unused_variables)]
pub async fn process_template(
    app: AppHandle,
    file_path: String,
    api_key: Option<String>,
    model: Option<String>,
    title: Option<String>,
) -> Result<TemplateResult, String> {
    process_template_internal(app, file_path, api_key, model, title, true).await
}
