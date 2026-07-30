//! Deterministic email→case matcher.
//!
//! No LLM is involved. The LLM classification code stays compiled and callable, but the
//! default pipeline mode never reaches it (design §5.9).
//!
//! **The core takes a `&Connection`, not an `AppHandle`.** That is what lets the eval
//! harness drive the matcher headless, and it mirrors `indexer::index_file_core`. The
//! `CaseManagementApi` trait still requires an `AppHandle`, which is precisely why
//! `emails_orchestrate`'s own tests cannot call it — so the real logic lives below that
//! boundary and the trait impl is a thin wrapper.

pub mod config;
pub mod explain;
pub mod scoring;
pub mod tier_a;
pub mod tier_b;
pub mod tier_c;

use rusqlite::Connection;

use crate::email::emails_case_api::{CaseMatchRequest, CaseMatchResult};

pub use config::{EmailPipelineMode, MatcherConfig, SignalWeights};
pub use scoring::{CaseCandidate, CaseMatchOutcome, MatchBand, SignalContribution};

pub struct CaseMatcher {
    config: MatcherConfig,
}

impl CaseMatcher {
    pub fn new(config: MatcherConfig) -> Self {
        Self { config }
    }

    pub fn config(&self) -> &MatcherConfig {
        &self.config
    }

    /// Every tier's raw contributions for this email, before aggregation or banding.
    ///
    /// All three tiers always run and their contributions are pooled. Tier A can settle a
    /// match on its own, but it is not an early exit: a decisive identifier plus content
    /// agreement should outrank the identifier alone, and running B/C anyway is what lets
    /// the ambiguity guard see a competing case.
    ///
    /// Separate from [`Self::match_email_core`] because everything downstream of it — the
    /// weights, the thresholds, the ambiguity margin — is exactly what P6's sweep varies.
    /// Collecting once and re-scoring in memory turns a grid search from N database passes
    /// into one, and is what makes ablation (drop a signal, re-score) possible at all.
    pub fn contributions(
        &self,
        conn: &Connection,
        request: &CaseMatchRequest,
    ) -> Result<Vec<(i64, SignalContribution)>, String> {
        let mut contributions = tier_a::evaluate(conn, request, &self.config)?;
        contributions.extend(tier_b::evaluate(conn, request, &self.config)?);
        contributions.extend(tier_c::evaluate(conn, request, &self.config)?);
        Ok(contributions)
    }

    /// Score an email against every case and return the ranked outcome.
    pub fn match_email_core(
        &self,
        conn: &Connection,
        request: &CaseMatchRequest,
    ) -> Result<CaseMatchOutcome, String> {
        Ok(self.decide(self.contributions(conn, request)?))
    }

    /// Aggregate, band and explain a set of contributions under this matcher's config.
    pub fn decide(&self, contributions: Vec<(i64, SignalContribution)>) -> CaseMatchOutcome {
        if contributions.is_empty() {
            return CaseMatchOutcome::none(
                "No case identifier in this email matched a known case.",
            );
        }

        let candidates = scoring::aggregate(contributions);
        let mut outcome = scoring::decide(candidates, &self.config);
        outcome.explanation = explain::describe(&outcome);
        outcome
    }
}

impl CaseMatchOutcome {
    /// Collapse to the shape the pipeline already persists.
    ///
    /// `Ignore` deliberately reports no case even when a weak candidate exists: surfacing
    /// a suggestion below the review threshold would be noise the user has to dismiss.
    pub fn into_case_match_result(self) -> CaseMatchResult {
        match (&self.best, self.band) {
            (Some(best), MatchBand::AutoLink) | (Some(best), MatchBand::Review) => {
                CaseMatchResult::matched(best.case_id, best.confidence, self.explanation.clone())
            }
            _ => CaseMatchResult::none(if self.explanation.is_empty() {
                "No case matched.".to_string()
            } else {
                self.explanation.clone()
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::emails_case_api::CaseMatchPhase;
    use crate::email::EmailExtractedSignals;
    use crate::store::matcher_schema::init_matcher_schema;
    use rusqlite::params;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, case_id INTEGER, message_id TEXT);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY, message_id TEXT);",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();
        conn
    }

    fn ident(conn: &Connection, case_id: i64, kind: &str, value: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO cases (id, name) VALUES (?1, 'case')",
            params![case_id],
        )
        .unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO case_identifiers
                (case_id, kind, value_norm, value_raw, source, weight, created_at)
             VALUES (?1, ?2, ?3, ?3, 'case_fields', 1.0, 'now')",
            params![case_id, kind, value],
        )
        .unwrap();
    }

    fn request(signals: EmailExtractedSignals) -> CaseMatchRequest {
        CaseMatchRequest {
            message_id: "<m@x>".into(),
            sender: "a@b.com".into(),
            subject: String::new(),
            snippet: String::new(),
            body_text: String::new(),
            attachment_text: String::new(),
            in_reply_to: None,
            references: vec![],
            search_terms: vec![],
            deterministic: signals,
            classification: None,
            phase: CaseMatchPhase::AfterDeterministic,
        }
    }

    fn matcher() -> CaseMatcher {
        CaseMatcher::new(MatcherConfig {
            auto_link_enabled: true,
            ..Default::default()
        })
    }

    #[test]
    fn matches_a_litigation_case_by_case_number() {
        let conn = db();
        ident(&conn, 1, "case_number", "12345/23");
        let outcome = matcher()
            .match_email_core(
                &conn,
                &request(EmailExtractedSignals {
                    case_numbers: vec!["12345/23".into()],
                    ..Default::default()
                }),
            )
            .unwrap();
        assert_eq!(outcome.best.as_ref().unwrap().case_id, 1);
        assert_eq!(outcome.band, MatchBand::AutoLink);
        assert!(outcome.explanation.contains("case_number"));
    }

    /// The other practice area: no case number exists anywhere, and the match has to come
    /// from the land-registry key.
    #[test]
    fn matches_a_conveyancing_case_by_land_registry() {
        let conn = db();
        ident(&conn, 7, "land_registry", "972/11/33");
        let outcome = matcher()
            .match_email_core(
                &conn,
                &request(EmailExtractedSignals {
                    land_registry: vec!["972/11/33".into()],
                    ..Default::default()
                }),
            )
            .unwrap();
        assert_eq!(outcome.best.as_ref().unwrap().case_id, 7);
        assert_eq!(outcome.band, MatchBand::AutoLink);
    }

    #[test]
    fn no_identifier_yields_no_match() {
        let conn = db();
        ident(&conn, 1, "case_number", "12345/23");
        let outcome = matcher()
            .match_email_core(&conn, &request(EmailExtractedSignals::default()))
            .unwrap();
        assert!(outcome.best.is_none());
        assert_eq!(outcome.band, MatchBand::Ignore);
    }

    /// Two cases sharing the only identifier present must go to a human, not be guessed.
    #[test]
    fn ambiguous_identifier_is_demoted_to_review() {
        let conn = db();
        ident(&conn, 1, "national_id", "123456782");
        ident(&conn, 2, "national_id", "123456782");
        let outcome = matcher()
            .match_email_core(
                &conn,
                &request(EmailExtractedSignals {
                    national_ids: vec!["123456782".into()],
                    ..Default::default()
                }),
            )
            .unwrap();
        assert!(outcome.ambiguous);
        assert_eq!(outcome.band, MatchBand::Review);
        assert!(outcome.explanation.contains("ambiguous"));
    }

    #[test]
    fn several_signals_on_one_case_reinforce_each_other() {
        let conn = db();
        ident(&conn, 3, "land_registry", "972/11");
        ident(&conn, 3, "national_id", "123456782");
        let outcome = matcher()
            .match_email_core(
                &conn,
                &request(EmailExtractedSignals {
                    land_registry: vec!["972/11".into()],
                    national_ids: vec!["123456782".into()],
                    ..Default::default()
                }),
            )
            .unwrap();
        let best = outcome.best.unwrap();
        assert_eq!(best.case_id, 3);
        assert_eq!(best.signals.len(), 2);
        assert!(best.confidence > 0.75);
    }

    #[test]
    fn result_conversion_reports_review_matches_but_not_ignored_ones() {
        let conn = db();
        ident(&conn, 1, "case_number", "12345/23");
        let matched = matcher()
            .match_email_core(
                &conn,
                &request(EmailExtractedSignals {
                    case_numbers: vec!["12345/23".into()],
                    ..Default::default()
                }),
            )
            .unwrap()
            .into_case_match_result();
        assert_eq!(matched.case_id, Some(1));
        assert!(matched.is_matched());

        let ignored = matcher()
            .match_email_core(&conn, &request(EmailExtractedSignals::default()))
            .unwrap()
            .into_case_match_result();
        assert_eq!(ignored.case_id, None);
        assert!(!ignored.is_matched());
    }

    /// The feedback loop end to end: confirming an email must make the *next* email from
    /// that sender matchable. Unit tests on either half passed while the loop was broken —
    /// `learn_from_confirmed_email` stored the whole `Name <addr>` header while Tier A
    /// looks up the bare address, so nothing ever matched.
    #[test]
    fn a_confirmed_sender_matches_the_next_email_from_them() {
        let conn = db();
        conn.execute("INSERT INTO cases (id, name) VALUES (5, 'case')", [])
            .unwrap();

        let follow_up = request(EmailExtractedSignals {
            sender_email: Some("adv@lawfirm.co.il".into()),
            ..Default::default()
        });
        assert!(
            matcher().match_email_core(&conn, &follow_up).unwrap().best.is_none(),
            "nothing is known about this sender yet"
        );

        crate::case::identifiers::learn_from_confirmed_email(
            &conn,
            5,
            "Adv Levy <Adv@LawFirm.co.il>",
            "<first@mail>",
        )
        .unwrap();

        let outcome = matcher().match_email_core(&conn, &follow_up).unwrap();
        let best = outcome.best.expect("confirmation should have taught the matcher");
        assert_eq!(best.case_id, 5);
        assert!(best.signals.iter().any(|s| s.name == "sender_confirmed"));
    }

    #[test]
    fn shipping_defaults_never_auto_link() {
        let conn = db();
        ident(&conn, 1, "case_number", "12345/23");
        let outcome = CaseMatcher::new(MatcherConfig::default())
            .match_email_core(
                &conn,
                &request(EmailExtractedSignals {
                    case_numbers: vec!["12345/23".into()],
                    ..Default::default()
                }),
            )
            .unwrap();
        assert_eq!(outcome.band, MatchBand::Review);
    }
}
