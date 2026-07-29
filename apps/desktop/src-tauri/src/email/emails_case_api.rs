//! Case-management matching API boundary.
//!
//! [`LocalCaseMatcherApi`] is the registered implementation: a thin wrapper that opens
//! the database and delegates to [`crate::email::case_matcher::CaseMatcher`], whose core
//! takes a `&Connection` rather than an `AppHandle` so it can be driven headless by the
//! eval harness.
//!
//! [`StubCaseManagementApi`] is retained for tests that need a matcher that always
//! declines.

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
    /// Full body and extracted attachment text — Tier B scores content against these,
    /// and Tier A needs identifiers that appear beyond the snippet cutoff.
    #[serde(default)]
    pub body_text: String,
    #[serde(default)]
    pub attachment_text: String,
    /// RFC 5322 threading headers. A reply to a message already linked to a case is the
    /// most precise signal available (design §5.5 A0).
    #[serde(default)]
    pub in_reply_to: Option<String>,
    #[serde(default)]
    pub references: Vec<String>,
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

/// Shared stub, kept for tests.
pub fn default_case_api() -> &'static StubCaseManagementApi {
    static API: StubCaseManagementApi = StubCaseManagementApi;
    &API
}

/// The deterministic matcher, running entirely locally.
pub struct LocalCaseMatcherApi;

impl CaseManagementApi for LocalCaseMatcherApi {
    fn match_email(
        &self,
        app: &AppHandle,
        request: &CaseMatchRequest,
    ) -> Result<CaseMatchResult, String> {
        use crate::email::case_matcher::{CaseMatcher, MatcherConfig};

        let conn = crate::store::open_db(app)?;
        let config = MatcherConfig::load(&conn);
        let outcome = CaseMatcher::new(config).match_email_core(&conn, request)?;
        Ok(outcome.into_case_match_result())
    }
}

/// Single injection point for ingestion / orchestration.
pub fn resolve_case_api(_app: &AppHandle) -> &dyn CaseManagementApi {
    static API: LocalCaseMatcherApi = LocalCaseMatcherApi;
    &API
}
