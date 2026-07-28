use tauri::AppHandle;

use crate::llm::llm_provider::{LlmProvider, MockProvider};
use crate::query::{query_search_documents_core, SearchOptions, USE_FTS_ONLY};

use super::engine::SearchEngine;
use super::types::{SearchRequest, SearchResponse, SearchScope};

pub struct DocumentSearchEngine;

impl SearchEngine for DocumentSearchEngine {
    fn search(
        app: &AppHandle,
        request: SearchRequest,
        model: Option<String>,
    ) -> impl std::future::Future<Output = Result<SearchResponse, String>> + Send {
        async move {
            let limit = request.limit.unwrap_or(10);
            let db_path = crate::store::db_path(app);
            let tags = request.filters.tags.as_deref();
            let notes_contains = request.filters.notes_contains.as_deref();

            let (provider, options) = if USE_FTS_ONLY {
                (
                    LlmProvider::Mock(MockProvider),
                    SearchOptions {
                        use_llm_query_analysis: false,
                        use_llm_rerank: false,
                    },
                )
            } else {
                let provider =
                    crate::llm::load_active_provider(app, String::new(), model, "query_analysis")?;
                let is_local = matches!(provider, LlmProvider::Local(_));
                let is_pro = crate::auth::is_pro_tier(app);
                (
                    provider,
                    SearchOptions {
                        use_llm_query_analysis: !is_local && is_pro,
                        use_llm_rerank: !is_local && is_pro,
                    },
                )
            };

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
}
