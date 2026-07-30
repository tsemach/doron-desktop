//! Synthetic email→case corpus: types and generation entry point.
//!
//! Produces a labelled corpus that the P4+ matcher eval scores against. Two practice
//! areas are generated because they identify a matter completely differently: a
//! litigation case is keyed by a court case number, a conveyancing matter has no case
//! number at all and is keyed by land-registry coordinates and party national IDs
//! (P0 / AMI-110). A corpus containing only case numbers would report a healthy score
//! while the matcher fails on half the product's workload.

pub mod cases;
pub mod emails;
pub mod pools;

use serde::{Deserialize, Serialize};

use super::rng::Rng;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Practice {
    Litigation,
    Conveyancing,
}

impl Practice {
    pub fn is_conveyancing(self) -> bool {
        matches!(self, Practice::Conveyancing)
    }
    pub fn label(self) -> &'static str {
        match self {
            Practice::Litigation => "litigation",
            Practice::Conveyancing => "conveyancing",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Hash, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    /// Identifier stated explicitly in the subject.
    Easy,
    /// No identifier; known sender plus vocabulary shared with the case documents.
    Medium,
    /// Party names only, with spelling variants, and vocabulary that drifts from the docs.
    Hard,
    /// Reply referencing a prior message on the case.
    Thread,
    /// Not case related at all — marketing, OTP, billing.
    Unrelated,
    /// Business-like mail belonging to no existing case, sometimes carrying a
    /// near-miss identifier. Unlike `Unrelated`, these survive the transactional
    /// filter and actually reach the matcher, so they are what measures real
    /// false-positive risk.
    Decoy,
    /// Names a party shared by two cases — must land in Review, never AutoLink.
    Adversarial,
}

impl Difficulty {
    pub fn label(self) -> &'static str {
        match self {
            Difficulty::Easy => "easy",
            Difficulty::Medium => "medium",
            Difficulty::Hard => "hard",
            Difficulty::Thread => "thread",
            Difficulty::Unrelated => "unrelated",
            Difficulty::Decoy => "decoy",
            Difficulty::Adversarial => "adversarial",
        }
    }
    pub const ALL: [Difficulty; 7] = [
        Difficulty::Easy,
        Difficulty::Medium,
        Difficulty::Hard,
        Difficulty::Thread,
        Difficulty::Unrelated,
        Difficulty::Decoy,
        Difficulty::Adversarial,
    ];
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Band {
    AutoLink,
    Review,
    Ignore,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    He,
    En,
    Mixed,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CaseField {
    pub name: String,
    pub value: String,
}

/// Identifiers deliberately planted in a case, kept so the eval can assert that the
/// matcher found what the generator put there.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Planted {
    pub case_number: Option<String>,
    pub land_registry: Option<String>,
    pub deed: Option<String>,
    pub national_ids: Vec<String>,
    pub party_names: Vec<String>,
    pub emails: Vec<String>,
    pub phones: Vec<String>,
    pub vocabulary: Vec<String>,
    pub drift: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CorpusCase {
    pub id: i64,
    pub practice: Practice,
    pub name: String,
    pub subject: String,
    /// Relative to the corpus root, e.g. `cases/case_001`.
    pub folder: String,
    pub topic: String,
    pub fields: Vec<CaseField>,
    pub documents: Vec<String>,
    pub planted: Planted,
    #[serde(skip)]
    pub document_bodies: Vec<(String, Vec<String>)>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FixtureAttachment {
    pub name: String,
    /// Relative to the corpus root.
    pub path: String,
    #[serde(skip)]
    pub paragraphs: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ExpectedSignals {
    pub case_numbers: Vec<String>,
    pub land_registry: Vec<String>,
    pub deeds: Vec<String>,
    pub national_ids: Vec<String>,
    pub party_names: Vec<String>,
    pub emails: Vec<String>,
    pub phone_numbers: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Expected {
    pub case_id: Option<i64>,
    pub practice: Option<Practice>,
    pub difficulty: Difficulty,
    pub signal: String,
    pub band: Band,
    /// Competing case for adversarial fixtures — the matcher must not pick either
    /// with confidence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub competing_case_id: Option<i64>,
    pub signals: ExpectedSignals,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EmailFixture {
    pub id: String,
    pub message_id: String,
    pub sender: String,
    pub sender_name: Option<String>,
    pub subject: String,
    pub body_text: String,
    pub received_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_reply_to: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<String>,
    #[serde(default)]
    pub attachments: Vec<FixtureAttachment>,
    pub expected: Expected,
}

#[derive(Clone, Debug)]
pub struct CorpusConfig {
    pub cases: usize,
    pub emails: usize,
    pub with_attachments: bool,
    pub seed: u64,
    pub unrelated_ratio: f64,
    /// Share of the not-case-related budget spent on `decoy` rather than obvious spam.
    pub decoy_share: f64,
    pub lang: Lang,
    /// (litigation, conveyancing) relative weights.
    pub practice_mix: (u32, u32),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CorpusManifest {
    pub seed: u64,
    pub generated_by: String,
    pub cases: usize,
    pub emails: usize,
    pub unrelated_ratio: f64,
    pub decoy_share: f64,
    pub practice_mix: String,
    pub lang: String,
}

pub struct Corpus {
    pub cases: Vec<CorpusCase>,
    pub emails: Vec<EmailFixture>,
    pub manifest: CorpusManifest,
}

/// Build the whole corpus in memory. Writing to disk is the caller's job (`generate.rs`),
/// which keeps this pure and unit-testable.
pub fn build(config: &CorpusConfig) -> Result<Corpus, String> {
    if config.cases == 0 {
        return Err("--cases must be at least 1".to_string());
    }
    if config.emails == 0 {
        return Err("--emails must be at least 1".to_string());
    }
    if !(0.0..=0.9).contains(&config.unrelated_ratio) {
        return Err("--unrelated-ratio must be between 0.0 and 0.9".to_string());
    }
    if !(0.0..=1.0).contains(&config.decoy_share) {
        return Err("--decoy-share must be between 0.0 and 1.0".to_string());
    }
    if config.practice_mix.0 + config.practice_mix.1 == 0 {
        return Err("--practice-mix must not be 0/0".to_string());
    }

    let mut rng = Rng::new(config.seed);
    let cases = cases::build_cases(&mut rng, config);
    let emails = emails::build_emails(&mut rng, config, &cases);

    Ok(Corpus {
        manifest: CorpusManifest {
            seed: config.seed,
            generated_by: "eval email generate".to_string(),
            cases: cases.len(),
            emails: emails.len(),
            unrelated_ratio: config.unrelated_ratio,
            decoy_share: config.decoy_share,
            practice_mix: format!("{}/{}", config.practice_mix.0, config.practice_mix.1),
            lang: match config.lang {
                Lang::He => "he".to_string(),
                Lang::En => "en".to_string(),
                Lang::Mixed => "mixed".to_string(),
            },
        },
        cases,
        emails,
    })
}

#[cfg(test)]
pub(crate) fn test_config() -> CorpusConfig {
    CorpusConfig {
        cases: 12,
        emails: 60,
        with_attachments: true,
        seed: 42,
        unrelated_ratio: 0.25,
        decoy_share: 0.4,
        lang: Lang::Mixed,
        practice_mix: (50, 50),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_degenerate_config() {
        let mut c = test_config();
        c.cases = 0;
        assert!(build(&c).is_err());

        let mut c = test_config();
        c.emails = 0;
        assert!(build(&c).is_err());

        let mut c = test_config();
        c.unrelated_ratio = 1.5;
        assert!(build(&c).is_err());

        let mut c = test_config();
        c.practice_mix = (0, 0);
        assert!(build(&c).is_err());

        let mut c = test_config();
        c.decoy_share = 2.0;
        assert!(build(&c).is_err());
    }

    #[test]
    fn same_seed_produces_identical_corpus() {
        let cfg = test_config();
        let a = build(&cfg).unwrap();
        let b = build(&cfg).unwrap();
        assert_eq!(
            serde_json::to_string(&a.cases).unwrap(),
            serde_json::to_string(&b.cases).unwrap()
        );
        assert_eq!(
            serde_json::to_string(&a.emails).unwrap(),
            serde_json::to_string(&b.emails).unwrap()
        );
    }

    #[test]
    fn different_seed_produces_different_corpus() {
        let a = build(&test_config()).unwrap();
        let mut cfg = test_config();
        cfg.seed = 1234;
        let b = build(&cfg).unwrap();
        assert_ne!(
            serde_json::to_string(&a.emails).unwrap(),
            serde_json::to_string(&b.emails).unwrap()
        );
    }
}
