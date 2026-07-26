use tauri::AppHandle;

use crate::llm::llm_provider::LlmProvider;
use crate::query::{query_search_documents_core, SearchOptions};

use super::engine::SearchEngine;
use super::types::{SearchRequest, SearchResponse, SearchScope};

pub struct DocumentSearchEngine;

impl DocumentSearchEngine {
    pub async fn execute(
        app: &AppHandle,
        request: SearchRequest,
        api_key: String,
        model: Option<String>,
    ) -> Result<SearchResponse, String> {
        let limit = request.limit.unwrap_or(10);
        let provider = crate::llm::load_active_provider(app, api_key, model, "query_analysis")?;
        let is_local = matches!(provider, LlmProvider::Local(_));
        let is_pro = crate::auth::is_pro_tier(app);
        let options = SearchOptions {
            use_llm_query_analysis: !is_local && is_pro,
            use_llm_rerank: !is_local && is_pro,
        };

        let db_path = crate::store::db_path(app);
        let tags = request.filters.tags.as_deref();
        let notes_contains = request.filters.notes_contains.as_deref();

        let results = query_search_documents_core(
            &db_path,
            &provider,
            &request.query,
            limit,
            &options,
            tags,
            notes_contains,
        )
        .await?;

        let total = results.len();
        Ok(SearchResponse {
            scope: SearchScope::Documents,
            results,
            total,
        })
    }
}

impl SearchEngine for DocumentSearchEngine {
    fn search(&self, _request: &SearchRequest) -> Result<SearchResponse, String> {
        Err("Use DocumentSearchEngine::execute for async document search".into())
    }
}
