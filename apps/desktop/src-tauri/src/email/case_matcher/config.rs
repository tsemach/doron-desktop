//! Tunable configuration for the case matcher (design §6.3).
//!
//! These constants started as informed guesses and were checked against a 144-point sweep
//! in P6 (`eval email run --sweep`, seed-42 corpus, 30 cases / 200 emails). The sweep found
//! **no mislink-free operating point that beats them**, so they survive unchanged — now as
//! a measured result rather than a guess. See design §10.8.
//!
//! The F1-optimal point (review 0.25, content 1.00) scores 0.94 but mislinks 8 emails.
//! Mislinking is a constraint, not a term in the objective: it is the one failure a user
//! cannot easily undo. `auto_link_enabled` stays off for the same reason.
//!
//! Re-run the sweep before changing anything here:
//! `cargo run --bin eval -- email run --corpus-dir <c> --mode matcher --sweep --apply`

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
    pub subject_match: f64,
    pub party_name: f64,
}

impl SignalWeights {
    /// Every weight by the signal name a [`SignalContribution`] carries, so a sweep can
    /// vary one without knowing the struct's shape.
    ///
    /// [`SignalContribution`]: super::scoring::SignalContribution
    pub const NAMES: &'static [&'static str] = &[
        "thread_ref",
        "case_number",
        "land_registry",
        "land_registry_partial",
        "deed",
        "national_id",
        "company_id",
        "sender_confirmed",
        "sender_metadata",
        "phone",
        "content",
        "subject_match",
        "party_name",
    ];

    pub fn get(&self, name: &str) -> Option<f64> {
        Some(match name {
            "thread_ref" => self.thread_ref,
            "case_number" => self.case_number,
            "land_registry" => self.land_registry,
            "land_registry_partial" => self.land_registry_partial,
            "deed" => self.deed,
            "national_id" => self.national_id,
            "company_id" => self.company_id,
            "sender_confirmed" => self.sender_confirmed,
            "sender_metadata" => self.sender_metadata,
            "phone" => self.phone,
            "content" => self.content,
            "subject_match" => self.subject_match,
            "party_name" => self.party_name,
            _ => return None,
        })
    }

    pub fn set(&mut self, name: &str, value: f64) -> bool {
        match name {
            "thread_ref" => self.thread_ref = value,
            "case_number" => self.case_number = value,
            "land_registry" => self.land_registry = value,
            "land_registry_partial" => self.land_registry_partial = value,
            "deed" => self.deed = value,
            "national_id" => self.national_id = value,
            "company_id" => self.company_id = value,
            "sender_confirmed" => self.sender_confirmed = value,
            "sender_metadata" => self.sender_metadata = value,
            "phone" => self.phone = value,
            "content" => self.content = value,
            "subject_match" => self.subject_match = value,
            "party_name" => self.party_name = value,
            _ => return false,
        }
        true
    }
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
            // The subject is where a sender writes the matter's name, so reproducing a
            // case title is strong evidence — but two matters for one client can carry
            // near-identical titles, so it stays below the hard identifiers.
            subject_match: 0.70,
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

    /// A weight the accessors do not know is a weight a sweep silently cannot tune, and
    /// nothing else would catch a field added without updating them.
    #[test]
    fn every_weight_is_reachable_by_name() {
        let mut w = SignalWeights::default();
        let json = serde_json::to_value(&w).unwrap();
        let fields: Vec<String> = json.as_object().unwrap().keys().cloned().collect();

        for field in &fields {
            assert!(
                SignalWeights::NAMES.contains(&field.as_str()),
                "weight '{field}' is missing from SignalWeights::NAMES"
            );
            assert!(w.get(field).is_some(), "weight '{field}' has no getter");
            assert!(w.set(field, 0.5), "weight '{field}' has no setter");
            assert_eq!(w.get(field), Some(0.5));
        }
        assert_eq!(fields.len(), SignalWeights::NAMES.len());
        assert_eq!(w.get("nonexistent"), None);
        assert!(!w.set("nonexistent", 0.5));
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
