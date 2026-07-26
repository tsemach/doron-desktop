mod types;
mod engine;
pub mod document;

pub use types::{SearchFilters, SearchRequest, SearchResponse, SearchScope};

use tauri::AppHandle;

#[tauri::command]
pub async fn search(
    app: AppHandle,
    request: SearchRequest,
    api_key: String,
    model: Option<String>,
) -> Result<SearchResponse, String> {
    match request.scope {
        SearchScope::Documents => {
            document::DocumentSearchEngine::execute(&app, request, api_key, model).await
        }
    }
}
