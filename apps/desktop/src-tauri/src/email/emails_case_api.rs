//! Case-management matching API boundary.
//!
//! Implement [`CaseManagementApi`] and register it via [`resolve_case_api`] when the
//! case-linking algorithm lands. Until then ingestion uses [`StubCaseManagementApi`].
//!
//! Expected behaviour per phase:
//! - [`CaseMatchPhase::AfterDeterministic`] — match on regex/header signals only
//!   (case numbers, IDs, phones, party names). A hit should skip the LLM pass.
//! - [`CaseMatchPhase::AfterLlm`] — match on merged deterministic + LLM `search_terms`.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::{EmailClassification, EmailExtractedSignals};

/// Which pipeline stage produced the match request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CaseMatchPhase {
    AfterDeterministic,
    AfterLlm,
}

/// Input for a case-link attempt. Carries everything the case service may need.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseMatchRequest {
    pub message_id: String,
    pub sender: String,
    pub subject: String,
    pub snippet: String,
    pub search_terms: Vec<String>,
    pub deterministic: EmailExtractedSignals,
    pub classification: Option<EmailClassification>,
    pub phase: CaseMatchPhase,
}

/// Output from the case-management service.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct CaseMatchResult {
    pub case_id: Option<i64>,
    pub confidence: f64,
    pub reason: String,
}

impl CaseMatchResult {
    pub fn none(reason: impl Into<String>) -> Self {
        Self {
            case_id: None,
            confidence: 0.0,
            reason: reason.into(),
        }
    }

    pub fn matched(case_id: i64, confidence: f64, reason: impl Into<String>) -> Self {
        Self {
            case_id: Some(case_id),
            confidence,
            reason: reason.into(),
        }
    }

    pub fn is_matched(&self) -> bool {
        self.case_id.is_some() && self.confidence > 0.0
    }
}

/// Pluggable case-management client. Implement this trait to wire the real API.
pub trait CaseManagementApi: Send + Sync {
    fn match_email(
        &self,
        app: &AppHandle,
        request: &CaseMatchRequest,
    ) -> Result<CaseMatchResult, String>;
}

/// Default no-op implementation until the external case API is available.
pub struct StubCaseManagementApi;

impl CaseManagementApi for StubCaseManagementApi {
    fn match_email(
        &self,
        _app: &AppHandle,
        request: &CaseMatchRequest,
    ) -> Result<CaseMatchResult, String> {
        Ok(CaseMatchResult::none(format!(
            "Case management API not configured (phase={:?}, terms={})",
            request.phase,
            request.search_terms.len()
        )))
    }
}

/// Shared stub used until a real `CaseManagementApi` is registered.
pub fn default_case_api() -> &'static StubCaseManagementApi {
    static API: StubCaseManagementApi = StubCaseManagementApi;
    &API
}

/// Single injection point for ingestion / orchestration. Swap the body when the real
/// case-linking client is ready (e.g. read from `AppHandle` state).
pub fn resolve_case_api(_app: &AppHandle) -> &dyn CaseManagementApi {
    default_case_api()
}
