use super::types::{SearchRequest, SearchResponse};

/// Extensible search engine interface for future scopes (cases, fields, etc.).
#[allow(dead_code)]
pub trait SearchEngine {
    fn search(&self, request: &SearchRequest) -> Result<SearchResponse, String>;
}
