//! Tunable configuration for the case matcher (design §6.3).
//!
//! Every constant here is currently an informed guess. P6 replaces them with values
//! derived from an eval sweep; until then they are deliberately conservative, and
//! `auto_link_enabled` is off so nothing is ever linked without a human confirming.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

pub const SETTINGS_KEY: &str = "active";

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum EmailPipelineMode {
    /// Tiers A/B/C only. No LLM call is made anywhere in the pipeline.
    #[default]
    Deterministic,
    /// Retains the previous behaviour: LLM enrichment between Tier A and Tier B.
    /// The LLM code stays compiled and callable; this is the only switch that reaches it.
    LlmAssisted,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SignalWeights {
    pub thread_ref: f64,
    pub case_number: f64,
    pub land_registry: f64,
    pub land_registry_partial: f64,
    pub deed: f64,
    pub national_id: f64,
    pub company_id: f64,
    pub sender_confirmed: f64,
    pub sender_metadata: f64,
    pub phone: f64,
    pub content: f64,
    pub party_name: f64,
}

impl Default for SignalWeights {
    fn default() -> Self {
        Self {
            thread_ref: 1.00,
            case_number: 0.95,
            land_registry: 0.95,
            // A gush+helka without the sub-parcel identifies a parcel, not a unit, so it
            // is contributory rather than decisive (design §5.5 A4).
            land_registry_partial: 0.75,
            deed: 0.90,
            national_id: 0.85,
            company_id: 0.85,
            sender_confirmed: 0.60,
            sender_metadata: 0.50,
            phone: 0.45,
            content: 0.70,
            party_name: 0.40,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MatcherConfig {
    pub mode: EmailPipelineMode,
    pub weights: SignalWeights,
    pub auto_link_threshold: f64,
    pub review_threshold: f64,
    /// If the top two candidates are within this margin the band is demoted to Review,
    /// however high the absolute score. Silently linking to the wrong matter is the one
    /// failure a user cannot easily undo.
    pub ambiguity_margin: f64,
    /// Ships false. Turn on only when an eval sweep shows a mislink-free operating point.
    pub auto_link_enabled: bool,
    pub top_documents_per_case: usize,
    pub max_terms: usize,
    pub case_text_weight: f64,
    pub document_weight: f64,
}

impl Default for MatcherConfig {
    fn default() -> Self {
        Self {
            mode: EmailPipelineMode::Deterministic,
            weights: SignalWeights::default(),
            auto_link_threshold: 0.85,
            review_threshold: 0.45,
            ambiguity_margin: 0.15,
            auto_link_enabled: false,
            top_documents_per_case: 5,
            max_terms: 40,
            // Case text is weighted higher because it is always present, whereas document
            // linkage depends on users filing files into case folders.
            case_text_weight: 0.6,
            document_weight: 0.4,
        }
    }
}

impl MatcherConfig {
    /// Load the stored config, falling back to defaults. A fresh install has no row, so
    /// the matcher must run correctly with none present.
    pub fn load(conn: &Connection) -> Self {
        let stored: Option<String> = conn
            .query_row(
                "SELECT value_json FROM case_matcher_settings WHERE key = ?1",
                params![SETTINGS_KEY],
                |r| r.get(0),
            )
            .ok();

        match stored.as_deref().map(serde_json::from_str::<MatcherConfig>) {
            Some(Ok(config)) => config,
            Some(Err(e)) => {
                // Corrupt or older-shaped JSON must not break ingestion.
                eprintln!("[matcher config] ignoring unreadable settings: {e}");
                Self::default()
            }
            None => Self::default(),
        }
    }

    pub fn save(&self, conn: &Connection) -> Result<(), String> {
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO case_matcher_settings (key, value_json, updated_at)
             VALUES (?1, ?2, ?3)",
            params![SETTINGS_KEY, json, chrono::Utc::now().to_rfc3339()],
        )
        .map_err(|e| format!("[matcher config save] {e}"))?;
        Ok(())
    }

    pub fn uses_llm(&self) -> bool {
        self.mode == EmailPipelineMode::LlmAssisted
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::matcher_schema::init_matcher_schema;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY);",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn defaults_are_safe() {
        let c = MatcherConfig::default();
        assert!(!c.auto_link_enabled, "auto-link must ship disabled");
        assert_eq!(c.mode, EmailPipelineMode::Deterministic);
        assert!(!c.uses_llm(), "default pipeline must not call the LLM");
        assert!(c.review_threshold < c.auto_link_threshold);
        assert!((c.case_text_weight + c.document_weight - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn missing_row_yields_defaults() {
        let conn = db();
        assert_eq!(MatcherConfig::load(&conn), MatcherConfig::default());
    }

    #[test]
    fn round_trips_through_the_database() {
        let conn = db();
        let mut c = MatcherConfig::default();
        c.auto_link_enabled = true;
        c.review_threshold = 0.55;
        c.mode = EmailPipelineMode::LlmAssisted;
        c.save(&conn).unwrap();

        let loaded = MatcherConfig::load(&conn);
        assert_eq!(loaded, c);
        assert!(loaded.uses_llm());
    }

    #[test]
    fn save_overwrites_rather_than_accumulating() {
        let conn = db();
        MatcherConfig::default().save(&conn).unwrap();
        MatcherConfig::default().save(&conn).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM case_matcher_settings WHERE key = 'active'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn corrupt_settings_fall_back_instead_of_failing() {
        let conn = db();
        conn.execute(
            "INSERT INTO case_matcher_settings (key, value_json, updated_at)
             VALUES ('active', '{not json', 'now')",
            [],
        )
        .unwrap();
        assert_eq!(MatcherConfig::load(&conn), MatcherConfig::default());
    }
}
