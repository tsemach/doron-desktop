//! `eval email corpus-stats` — report the composition of a generated corpus.
//!
//! Exists so P1 is verifiable on its own: a corpus whose difficulty spread or practice
//! split has drifted would quietly flatter every later phase's numbers.

use clap::Args;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::corpus::{CorpusCase, Difficulty, EmailFixture};

#[derive(Args, Debug, Clone)]
pub struct CorpusStatsArgs {
    /// Corpus directory produced by `eval email generate`
    #[arg(long, default_value = "./email_eval_corpus")]
    pub corpus_dir: String,
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn pct(n: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        n as f64 / total as f64 * 100.0
    }
}

pub struct CorpusStats {
    pub cases: Vec<CorpusCase>,
    pub emails: Vec<EmailFixture>,
    pub root: PathBuf,
}

impl CorpusStats {
    pub fn load(corpus_dir: &str) -> Result<Self, String> {
        let root = PathBuf::from(corpus_dir);
        let cases_path = root.join("cases.json");
        let emails_path = root.join("email_matching_dataset.json");

        if !cases_path.exists() || !emails_path.exists() {
            return Err(format!(
                "No corpus at '{}'. Run 'eval email generate --corpus-dir {}' first.",
                root.display(),
                corpus_dir
            ));
        }

        Ok(Self {
            cases: read_json(&cases_path)?,
            emails: read_json(&emails_path)?,
            root,
        })
    }

    /// Fixtures whose `expected.case_id` does not exist in `cases.json`.
    pub fn dangling_case_ids(&self) -> Vec<String> {
        self.emails
            .iter()
            .filter(|e| {
                e.expected
                    .case_id
                    .is_some_and(|id| !self.cases.iter().any(|c| c.id == id))
            })
            .map(|e| e.id.clone())
            .collect()
    }

    /// Attachment paths referenced by a fixture but absent on disk.
    pub fn missing_attachments(&self) -> Vec<String> {
        let mut missing = Vec::new();
        for email in &self.emails {
            for att in &email.attachments {
                if !self.root.join(&att.path).exists() {
                    missing.push(format!("{} → {}", email.id, att.path));
                }
            }
        }
        missing
    }

    /// Documents listed on a case but absent on disk.
    pub fn missing_documents(&self) -> Vec<String> {
        let mut missing = Vec::new();
        for case in &self.cases {
            for doc in &case.documents {
                if !self.root.join(doc).exists() {
                    missing.push(format!("case {} → {}", case.id, doc));
                }
            }
        }
        missing
    }

    /// Conveyancing cases that wrongly carry a court case number. Such a leak would
    /// mask the exact failure the P0 audit found, so it is treated as fatal.
    pub fn conveyancing_with_case_number(&self) -> Vec<i64> {
        self.cases
            .iter()
            .filter(|c| c.practice.is_conveyancing() && c.planted.case_number.is_some())
            .map(|c| c.id)
            .collect()
    }

    pub fn litigation_without_case_number(&self) -> Vec<i64> {
        self.cases
            .iter()
            .filter(|c| !c.practice.is_conveyancing() && c.planted.case_number.is_none())
            .map(|c| c.id)
            .collect()
    }
}

pub async fn execute(args: CorpusStatsArgs) -> Result<(), String> {
    let stats = CorpusStats::load(&args.corpus_dir)?;
    let total = stats.emails.len();

    println!("Corpus: {}", stats.root.display());
    println!("  cases    {}", stats.cases.len());
    println!("  emails   {total}");

    let conveyancing = stats
        .cases
        .iter()
        .filter(|c| c.practice.is_conveyancing())
        .count();
    let litigation = stats.cases.len() - conveyancing;
    println!("\nPractice split (cases)");
    println!(
        "  litigation     {litigation:>4}  ({:.1}%)",
        pct(litigation, stats.cases.len())
    );
    println!(
        "  conveyancing   {conveyancing:>4}  ({:.1}%)",
        pct(conveyancing, stats.cases.len())
    );

    let mut by_difficulty: BTreeMap<Difficulty, usize> = BTreeMap::new();
    for e in &stats.emails {
        *by_difficulty.entry(e.expected.difficulty).or_insert(0) += 1;
    }
    println!("\nDifficulty spread (emails)");
    for d in Difficulty::ALL {
        let n = by_difficulty.get(&d).copied().unwrap_or(0);
        println!("  {:<13} {n:>4}  ({:.1}%)", d.label(), pct(n, total));
    }

    let mut by_practice: BTreeMap<&'static str, usize> = BTreeMap::new();
    for e in &stats.emails {
        if let Some(p) = e.expected.practice {
            *by_practice.entry(p.label()).or_insert(0) += 1;
        }
    }
    println!("\nCase-related emails by practice");
    for (practice, n) in &by_practice {
        println!("  {practice:<14} {n:>4}  ({:.1}%)", pct(*n, total));
    }

    let mut by_signal: BTreeMap<String, usize> = BTreeMap::new();
    for e in &stats.emails {
        *by_signal.entry(e.expected.signal.clone()).or_insert(0) += 1;
    }
    println!("\nExpected primary signal");
    for (signal, n) in &by_signal {
        println!("  {signal:<24} {n:>4}");
    }

    let with_att = stats
        .emails
        .iter()
        .filter(|e| !e.attachments.is_empty())
        .count();
    let att_total: usize = stats.emails.iter().map(|e| e.attachments.len()).sum();
    let hidden = stats
        .emails
        .iter()
        .filter(|e| e.expected.signal == "attachment_identifier")
        .count();
    println!("\nAttachments");
    println!("  emails with attachments  {with_att} ({:.1}%)", pct(with_att, total));
    println!("  attachment files         {att_total}");
    println!("  identifier ONLY in attachment  {hidden}");

    let doc_total: usize = stats.cases.iter().map(|c| c.documents.len()).sum();
    let empty_cases = stats.cases.iter().filter(|c| c.documents.is_empty()).count();
    let no_emails = stats
        .cases
        .iter()
        .filter(|c| {
            !stats
                .emails
                .iter()
                .any(|e| e.expected.case_id == Some(c.id))
        })
        .count();
    println!("\nCase corpora");
    println!("  documents total          {doc_total}");
    println!(
        "  avg documents per case   {:.1}",
        doc_total as f64 / stats.cases.len().max(1) as f64
    );
    println!("  cases with no documents  {empty_cases}");
    println!("  cases with no emails     {no_emails}");

    let adversarial = by_difficulty
        .get(&Difficulty::Adversarial)
        .copied()
        .unwrap_or(0);
    println!("\nAdversarial pairs        {adversarial}");

    // Integrity checks — these are the P1 exit criteria, enforced rather than eyeballed.
    let mut problems: Vec<String> = Vec::new();
    let dangling = stats.dangling_case_ids();
    if !dangling.is_empty() {
        problems.push(format!("{} fixture(s) reference a missing case: {dangling:?}", dangling.len()));
    }
    let missing_att = stats.missing_attachments();
    if !missing_att.is_empty() {
        problems.push(format!("{} attachment file(s) missing: {missing_att:?}", missing_att.len()));
    }
    let missing_docs = stats.missing_documents();
    if !missing_docs.is_empty() {
        problems.push(format!("{} case document(s) missing: {missing_docs:?}", missing_docs.len()));
    }
    let leaked = stats.conveyancing_with_case_number();
    if !leaked.is_empty() {
        problems.push(format!(
            "conveyancing case(s) carry a court case number: {leaked:?}"
        ));
    }
    let missing_cn = stats.litigation_without_case_number();
    if !missing_cn.is_empty() {
        problems.push(format!(
            "litigation case(s) missing a case number: {missing_cn:?}"
        ));
    }

    if problems.is_empty() {
        println!("\nIntegrity: OK");
        Ok(())
    } else {
        println!("\nIntegrity: {} problem(s)", problems.len());
        for p in &problems {
            eprintln!("  ✗ {p}");
        }
        Err(format!("Corpus integrity check failed ({} problem(s))", problems.len()))
    }
}
