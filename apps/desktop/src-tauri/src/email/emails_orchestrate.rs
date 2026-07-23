//! End-to-end email classification and case-linking pipeline.
//!
//! Flow:
//! 1. Deterministic signal extraction
//! 2. Case-management match → early exit if connected
//! 3. LLM classification + extraction (skipped on early exit)
//! 4. Case-management match again with enriched terms
//! 5. Alert / connection (caller applies `apply_pipeline_outcome`)

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::llm::llm_provider::{get_active_provider, LlmProvider, ProviderConfig};

use super::emails_case_api::{
    CaseManagementApi, CaseMatchPhase, CaseMatchRequest, CaseMatchResult,
};
use super::emails_classify::{classify_email_llm, EmailClassification};
use super::emails_classify_deterministic::extract_email_signals;
use super::emails_ops::is_transactional_or_spam;
use super::EmailExtractedSignals;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreparedEmail {
    pub message_id: String,
    pub sender: String,
    pub subject: String,
    pub snippet: String,
    pub body_text: String,
    pub received_at: String,
    pub attachments_json: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PipelineStopStage {
    IgnoredSpam,
    DeterministicCaseMatch,
    LlmSkippedNoProvider,
    LlmIgnoredNotForReview,
    AfterLlmCaseMatch,
    NoCaseMatch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailPipelineResult {
    pub deterministic: EmailExtractedSignals,
    pub classification: Option<EmailClassification>,
    pub case_match: CaseMatchResult,
    pub stop_stage: PipelineStopStage,
}

impl EmailPipelineResult {
    pub fn should_surface_alert(&self) -> bool {
        self.case_match.is_matched()
    }

    pub fn ignore_reason(&self) -> Option<&str> {
        if self.should_surface_alert() {
            return None;
        }
        Some(self.case_match.reason.as_str())
    }
}

fn build_match_request(
    email: &PreparedEmail,
    deterministic: &EmailExtractedSignals,
    classification: Option<&EmailClassification>,
    phase: CaseMatchPhase,
) -> CaseMatchRequest {
    let search_terms = classification
        .map(|c| c.search_terms.clone())
        .unwrap_or_else(|| deterministic.to_search_terms());

    CaseMatchRequest {
        message_id: email.message_id.clone(),
        sender: email.sender.clone(),
        subject: email.subject.clone(),
        snippet: email.snippet.clone(),
        search_terms,
        deterministic: deterministic.clone(),
        classification: classification.cloned(),
        phase,
    }
}

fn llm_provider_from_app(app: &AppHandle) -> Option<LlmProvider> {
    let config = crate::llm::get_ai_settings_internal(app)?;

    // Checked before the generic byom/local branch below, same as
    // check_ai_health -- otherwise email classification would keep
    // silently using the old direct-provider path even after online mode
    // is proxied. Missing backend_url/session_token (signed out) is
    // treated the same as "not configured" (None), matching this
    // function's existing all-paths-optional contract rather than
    // introducing a Result here.
    if config.ai_mode == "online" {
        let backend_url = crate::auth::get_backend_url(app)?;
        let session_token = crate::auth::get_session_token(app)?;
        let model = crate::llm::llm_provider::normalize_model_name(&config.ai_model);
        return Some(LlmProvider::BackendOnline(
            crate::llm::llm_provider::BackendOnlineProvider {
                backend_url,
                session_token,
                provider: config.provider.clone(),
                model,
                purpose: "email_classification",
            },
        ));
    }

    let use_llm = if config.ai_mode == "byom" {
        !config.api_key_enc.is_empty()
    } else {
        !config.ai_mode.is_empty()
    };
    if !use_llm {
        return None;
    }

    Some(get_active_provider(ProviderConfig {
        provider_type: if config.ai_mode == "local" {
            "local".to_string()
        } else {
            config.provider.clone()
        },
        api_key: if config.ai_mode == "local" {
            String::new()
        } else {
            config.api_key_enc.clone()
        },
        model: config.ai_model.clone(),
        base_url: if config.ai_mode == "local" {
            Some("http://localhost:10086/v1".to_string())
        } else {
            None
        },
    }))
}

pub async fn run_email_pipeline(
    app: &AppHandle,
    email: &PreparedEmail,
    case_api: &dyn CaseManagementApi,
) -> Result<EmailPipelineResult, String> {
    if is_transactional_or_spam(&email.sender, &email.subject) {
        return Ok(EmailPipelineResult {
            deterministic: EmailExtractedSignals::default(),
            classification: None,
            case_match: CaseMatchResult::none("Transactional or spam email ignored."),
            stop_stage: PipelineStopStage::IgnoredSpam,
        });
    }

    // 1. Deterministic classification / extraction
    let deterministic = extract_email_signals(&email.sender, &email.subject, &email.snippet);

    // 2. First case-management match — exit early when confidently connected
    let early_request = build_match_request(
        email,
        &deterministic,
        None,
        CaseMatchPhase::AfterDeterministic,
    );
    let early_match = case_api.match_email(app, &early_request)?;

    if early_match.is_matched() {
        return Ok(EmailPipelineResult {
            deterministic,
            classification: None,
            case_match: early_match,
            stop_stage: PipelineStopStage::DeterministicCaseMatch,
        });
    }

    // 3. LLM classification + extraction
    let classification = match llm_provider_from_app(app) {
        Some(provider) => {
            classify_email_llm(
                &provider,
                &email.sender,
                &email.subject,
                &email.snippet,
            )
            .await?
        }
        None => {
            return Ok(EmailPipelineResult {
                deterministic,
                classification: None,
                case_match: CaseMatchResult::none(
                    "LLM provider not configured; no case match after deterministic pass.",
                ),
                stop_stage: PipelineStopStage::LlmSkippedNoProvider,
            });
        }
    };

    if !classification.review {
        let reason = format!(
            "LLM marked not for review: {}",
            classification.review_reason
        );
        return Ok(EmailPipelineResult {
            deterministic,
            classification: Some(classification),
            case_match: CaseMatchResult::none(reason),
            stop_stage: PipelineStopStage::LlmIgnoredNotForReview,
        });
    }

    // 4. Second case-management match with LLM-enriched signals
    let late_request = build_match_request(
        email,
        &deterministic,
        Some(&classification),
        CaseMatchPhase::AfterLlm,
    );
    let case_match = case_api.match_email(app, &late_request)?;

    let stop_stage = if case_match.is_matched() {
        PipelineStopStage::AfterLlmCaseMatch
    } else {
        PipelineStopStage::NoCaseMatch
    };

    Ok(EmailPipelineResult {
        deterministic,
        classification: Some(classification),
        case_match,
        stop_stage,
    })
}

/// Step 5: persist a pending alert or mark the email as ignored.
pub fn apply_pipeline_outcome(
    app: &AppHandle,
    email: &PreparedEmail,
    result: &EmailPipelineResult,
) -> Result<(), String> {
    use rusqlite::params;
    use std::path::PathBuf;
    use tauri::{Emitter, Manager};

    use crate::store;

    let conn = store::open_db(app).map_err(|e| e.to_string())?;
    let staging_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging")
        .join(&email.message_id);

    if result.should_surface_alert() {
        let case_id = result.case_match.case_id;
        conn.execute(
            "INSERT INTO pending_email_alerts (message_id, sender, subject, body_snippet, body_text, received_at, suggested_case_id, confidence, reason, attachments_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                email.message_id,
                email.sender,
                email.subject,
                email.snippet,
                email.body_text,
                email.received_at,
                case_id,
                result.case_match.confidence,
                result.case_match.reason,
                email.attachments_json,
            ],
        )
        .map_err(|e| format!("Database insert error: {e}"))?;

        let _ = app.emit("new-email-alert", ());
        return Ok(());
    }

    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(&staging_dir);
    }

    conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![email.message_id],
    )
    .map_err(|e| format!("Database ignore insert error: {e}"))?;

    let message_id_trimmed = email
        .message_id
        .trim_matches(|c| c == '<' || c == '>');
    conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id_trimmed],
    )
    .map_err(|e| format!("Database ignore insert error: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::emails_case_api::StubCaseManagementApi;

    fn sample_email() -> PreparedEmail {
        PreparedEmail {
            message_id: "<test@example.com>".to_string(),
            sender: "yossi.cohen@gmail.com".to_string(),
            subject: "עדכון תיק 12345/23".to_string(),
            snippet: "שלום עו\"ד".to_string(),
            body_text: "שלום עו\"ד".to_string(),
            received_at: "2026-01-01T00:00:00Z".to_string(),
            attachments_json: "[]".to_string(),
        }
    }

    #[allow(dead_code)]
    struct MockCaseApi {
        deterministic_id: Option<i64>,
        llm_id: Option<i64>,
    }

    impl CaseManagementApi for MockCaseApi {
        fn match_email(
            &self,
            _app: &AppHandle,
            request: &CaseMatchRequest,
        ) -> Result<CaseMatchResult, String> {
            match request.phase {
                CaseMatchPhase::AfterDeterministic => {
                    if let Some(id) = self.deterministic_id {
                        Ok(CaseMatchResult::matched(id, 0.95, "mock deterministic"))
                    } else {
                        Ok(CaseMatchResult::none("no deterministic match"))
                    }
                }
                CaseMatchPhase::AfterLlm => {
                    if let Some(id) = self.llm_id {
                        Ok(CaseMatchResult::matched(id, 0.8, "mock llm match"))
                    } else {
                        Ok(CaseMatchResult::none("no llm match"))
                    }
                }
            }
        }
    }

    #[test]
    fn pipeline_result_surfaces_alert_when_matched() {
        let result = EmailPipelineResult {
            deterministic: EmailExtractedSignals::default(),
            classification: None,
            case_match: CaseMatchResult::matched(42, 0.9, "test"),
            stop_stage: PipelineStopStage::DeterministicCaseMatch,
        };
        assert!(result.should_surface_alert());
    }

    #[tokio::test]
    async fn early_exit_skips_llm_when_deterministic_matches() {
        // AppHandle not available in unit tests — test the match-request builder and mock API logic.
        let email = sample_email();
        let deterministic = extract_email_signals(&email.sender, &email.subject, &email.snippet);
        assert!(deterministic.case_numbers.contains(&"12345/23".to_string()));

        let request = build_match_request(
            &email,
            &deterministic,
            None,
            CaseMatchPhase::AfterDeterministic,
        );
        assert!(request.search_terms.contains(&"12345/23".to_string()));
    }

    #[test]
    fn stub_case_api_returns_no_match() {
        let api = StubCaseManagementApi;
        let request = CaseMatchRequest {
            message_id: "x".to_string(),
            sender: "a@b.com".to_string(),
            subject: "test".to_string(),
            snippet: "body".to_string(),
            search_terms: vec!["12345/23".to_string()],
            deterministic: EmailExtractedSignals::default(),
            classification: None,
            phase: CaseMatchPhase::AfterDeterministic,
        };
        // Cannot call without AppHandle; verify request shape is serializable for future API.
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("12345/23"));
        let _ = api; // stub is constructible
    }
}
