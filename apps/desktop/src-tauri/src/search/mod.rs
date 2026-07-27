mod types;
mod engine;
pub mod document;

pub use types::{SearchFilters, SearchRequest, SearchResponse, SearchScope};
pub use document::DocumentSearchEngine;
pub use engine::SearchEngine;

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
            DocumentSearchEngine::search(&app, request, api_key, model).await
        }
    }
}
