use std::future::Future;

use tauri::AppHandle;

use super::types::{SearchRequest, SearchResponse};

/// Extensible search engine interface for future scopes (cases, fields, etc.).
pub trait SearchEngine {
    fn search(
        app: &AppHandle,
        request: SearchRequest,
        api_key: String,
        model: Option<String>,
    ) -> impl Future<Output = Result<SearchResponse, String>> + Send;
}
