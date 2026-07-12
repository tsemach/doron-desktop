use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug, Default)]
pub struct DateRange {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Deserialize, Debug, Default)]
pub struct QueryAnalysis {
    pub keywords: Option<Vec<String>>,
    #[allow(dead_code)]
    pub entities: Option<Vec<String>>,
    pub doc_types: Option<serde_json::Value>,
    pub date_range: Option<DateRange>,
    #[allow(dead_code)]
    pub summary_importance: Option<bool>,
}

#[derive(Serialize, Clone, Debug)]
pub struct DocumentRow {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub doc_type: Option<String>,
    pub doc_date: Option<String>,
    pub language: Option<String>,
    pub keywords: Vec<String>,
    pub topics: Vec<String>,
    pub entities: Vec<String>,
    pub authors: Vec<String>,
    pub page_count: Option<i32>,
    pub confidence: Option<f64>,
}

#[derive(Serialize)]
pub struct RerankCandidate {
    pub id: i64,
    pub file_name: String,
    pub title: Option<String>,
    pub summary: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SearchOptions {
    pub use_llm_query_analysis: bool,
    pub use_llm_rerank: bool,
}
