use serde::{Deserialize, Serialize};

use crate::query::{DocumentRow, TagFilter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchScope {
    Documents,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub tags: Option<Vec<TagFilter>>,
    pub notes_contains: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub scope: SearchScope,
    pub query: String,
    pub limit: Option<usize>,
    #[serde(default)]
    pub filters: SearchFilters,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResponse {
    pub scope: SearchScope,
    pub results: Vec<DocumentRow>,
    pub total: usize,
}
