//! `eval email signals` — score signal extraction against the corpus ground truth.
//!
//! Runs before any matcher exists: if the identifiers never come out of the email, no
//! amount of matcher tuning helps. Also quantifies the two defects P3 fixes — identifiers
//! past the old 500-character snippet cutoff, and identifiers that live only inside an
//! attachment.

use clap::Args;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use tauri_app_lib::email::{
    combined_text, extract_attachment_texts, extract_email_signals, AttachmentLimits,
    AttachmentText, EmailExtractedSignals,
};
use tauri_app_lib::email::AttachmentMetadata;

use super::corpus::{EmailFixture, ExpectedSignals};

#[derive(Args, Debug, Clone)]
pub struct SignalsArgs {
    /// Corpus directory produced by `eval email generate`
    #[arg(long, default_value = "./email_eval_corpus")]
    pub corpus_dir: String,

    /// Print every fixture whose extraction missed something
    #[arg(long)]
    pub verbose: bool,
}

/// Mirrors the truncation ingestion applied before P3, so the report can show how many
/// identifiers the old snippet-only path would have missed.
const LEGACY_SNIPPET_CHARS: usize = 500;

#[derive(Default, Debug, Clone, Copy)]
struct Tally {
    expected: usize,
    found: usize,
    extra: usize,
}

impl Tally {
    fn recall(&self) -> f64 {
        if self.expected == 0 {
            100.0
        } else {
            self.found as f64 / self.expected as f64 * 100.0
        }
    }
    fn precision(&self) -> f64 {
        let predicted = self.found + self.extra;
        if predicted == 0 {
            100.0
        } else {
            self.found as f64 / predicted as f64 * 100.0
        }
    }
}

fn norm(v: &str) -> String {
    v.trim().to_lowercase()
}

fn score(expected: &[String], actual: &[String], tally: &mut Tally) -> Vec<String> {
    let actual_norm: Vec<String> = actual.iter().map(|v| norm(v)).collect();
    let mut missed = Vec::new();

    for want in expected {
        tally.expected += 1;
        if actual_norm.iter().any(|a| a == &norm(want)) {
            tally.found += 1;
        } else {
            missed.push(want.clone());
        }
    }
    let expected_norm: Vec<String> = expected.iter().map(|v| norm(v)).collect();
    tally.extra += actual_norm
        .iter()
        .filter(|a| !expected_norm.contains(a))
        .count();
    missed
}

fn attachments_for(root: &Path, fixture: &EmailFixture) -> Vec<AttachmentText> {
    if fixture.attachments.is_empty() {
        return Vec::new();
    }
    // Rebuild the metadata blob ingestion would have staged.
    let staged: Vec<AttachmentMetadata> = fixture
        .attachments
        .iter()
        .map(|a| AttachmentMetadata {
            name: a.name.clone(),
            staged_path: root.join(&a.path).to_string_lossy().to_string(),
            size_kb: 0,
            is_imported: None,
        })
        .collect();
    let json = serde_json::to_string(&staged).unwrap_or_else(|_| "[]".to_string());
    extract_attachment_texts(&json, &AttachmentLimits::default())
}

fn actual_for(kind: &str, s: &EmailExtractedSignals) -> Vec<String> {
    match kind {
        "case_numbers" => s.case_numbers.clone(),
        "land_registry" => s.land_registry.clone(),
        "deeds" => s.deeds.clone(),
        "national_ids" => s.national_ids.clone(),
        "party_names" => s.party_names.clone(),
        "emails" => s.emails.clone(),
        "phone_numbers" => s.phone_numbers.clone(),
        _ => Vec::new(),
    }
}

fn expected_for(kind: &str, e: &ExpectedSignals) -> Vec<String> {
    match kind {
        "case_numbers" => e.case_numbers.clone(),
        "land_registry" => e.land_registry.clone(),
        "deeds" => e.deeds.clone(),
        "national_ids" => e.national_ids.clone(),
        "party_names" => e.party_names.clone(),
        "emails" => e.emails.clone(),
        "phone_numbers" => e.phone_numbers.clone(),
        _ => Vec::new(),
    }
}

const KINDS: [&str; 7] = [
    "case_numbers",
    "land_registry",
    "deeds",
    "national_ids",
    "party_names",
    "emails",
    "phone_numbers",
];

pub async fn execute(args: SignalsArgs) -> Result<(), String> {
    let root = PathBuf::from(&args.corpus_dir);
    let dataset = root.join("email_matching_dataset.json");
    if !dataset.exists() {
        return Err(format!(
            "No corpus at '{}'. Run 'eval email generate' first.",
            root.display()
        ));
    }
    let raw = std::fs::read_to_string(&dataset).map_err(|e| e.to_string())?;
    let fixtures: Vec<EmailFixture> =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse dataset: {e}"))?;

    let mut tallies: BTreeMap<&str, Tally> = BTreeMap::new();
    let mut att_total = 0usize;
    let mut att_extracted = 0usize;
    let mut att_skipped: BTreeMap<String, usize> = BTreeMap::new();
    let mut att_chars = 0usize;
    let mut beyond_snippet = 0usize;
    let mut attachment_only_hits = 0usize;
    let mut attachment_only_total = 0usize;
    let mut failures: Vec<String> = Vec::new();

    for fixture in &fixtures {
        let attachments = attachments_for(&root, fixture);
        att_total += attachments.len();
        for a in &attachments {
            if a.extracted {
                att_extracted += 1;
                att_chars += a.text.chars().count();
            } else {
                *att_skipped
                    .entry(a.skip_reason.clone().unwrap_or_else(|| "unknown".into()))
                    .or_insert(0) += 1;
            }
        }
        let attachment_text = combined_text(&attachments);

        let full_body = if attachment_text.is_empty() {
            fixture.body_text.clone()
        } else {
            format!("{}\n{}", fixture.body_text, attachment_text)
        };
        let signals = extract_email_signals(&fixture.sender, &fixture.subject, &full_body);

        // What the pre-P3 pipeline would have seen: subject + truncated body, no attachments.
        let legacy_snippet: String = fixture.body_text.chars().take(LEGACY_SNIPPET_CHARS).collect();
        let legacy = extract_email_signals(&fixture.sender, &fixture.subject, &legacy_snippet);

        let mut fixture_missed = Vec::new();
        for kind in KINDS {
            let expected = expected_for(kind, &fixture.expected.signals);
            if expected.is_empty() {
                continue;
            }
            let actual = actual_for(kind, &signals);
            let missed = score(&expected, &actual, tallies.entry(kind).or_default());
            if !missed.is_empty() {
                fixture_missed.push(format!("{kind}: {missed:?}"));
            }

            let legacy_actual = actual_for(kind, &legacy);
            for want in &expected {
                let now = actual.iter().any(|a| norm(a) == norm(want));
                let before = legacy_actual.iter().any(|a| norm(a) == norm(want));
                if now && !before {
                    beyond_snippet += 1;
                }
            }
        }

        if fixture.expected.signal == "attachment_identifier" {
            attachment_only_total += 1;
            let expected_ids: Vec<String> = fixture
                .expected
                .signals
                .case_numbers
                .iter()
                .chain(fixture.expected.signals.land_registry.iter())
                .cloned()
                .collect();
            let all: Vec<String> = signals
                .case_numbers
                .iter()
                .chain(signals.land_registry.iter())
                .cloned()
                .collect();
            if !expected_ids.is_empty()
                && expected_ids
                    .iter()
                    .all(|w| all.iter().any(|a| norm(a) == norm(w)))
            {
                attachment_only_hits += 1;
            }
        }

        if !fixture_missed.is_empty() {
            failures.push(format!("[{}] {}", fixture.id, fixture_missed.join(" | ")));
        }
    }

    println!("Signal extraction ({} emails)", fixtures.len());
    for kind in KINDS {
        if let Some(t) = tallies.get(kind) {
            if t.expected == 0 {
                continue;
            }
            println!(
                "  {kind:<15} recall {:>5.1}%  precision {:>5.1}%   ({}/{} found, {} extra)",
                t.recall(),
                t.precision(),
                t.found,
                t.expected,
                t.extra
            );
        }
    }

    println!("\nAttachments");
    println!(
        "  extracted        {att_extracted}/{att_total}  ({:.1}%)",
        if att_total == 0 {
            100.0
        } else {
            att_extracted as f64 / att_total as f64 * 100.0
        }
    );
    for (reason, n) in &att_skipped {
        println!("  skipped          {n} ({reason})");
    }
    println!("  chars extracted  {att_chars}");
    println!(
        "  identifier ONLY in attachment, recovered: {attachment_only_hits}/{attachment_only_total}"
    );

    println!("\nBody coverage");
    println!("  signals found beyond the legacy 500-char snippet: {beyond_snippet}");

    if args.verbose && !failures.is_empty() {
        println!("\nMisses");
        for f in &failures {
            println!("  {f}");
        }
    }

    // P3 exit criteria.
    let mut problems = Vec::new();
    let check = |kind: &str, floor: f64, problems: &mut Vec<String>| {
        if let Some(t) = tallies.get(kind) {
            if t.expected > 0 && t.recall() < floor {
                problems.push(format!(
                    "{kind} recall {:.1}% is below the {floor:.0}% floor",
                    t.recall()
                ));
            }
        }
    };
    check("case_numbers", 95.0, &mut problems);
    check("land_registry", 90.0, &mut problems);
    check("emails", 95.0, &mut problems);

    if att_total > 0 {
        let rate = att_extracted as f64 / att_total as f64 * 100.0;
        if rate < 95.0 {
            problems.push(format!("attachment extraction {rate:.1}% is below 95%"));
        }
    }
    if attachment_only_total > 0 && attachment_only_hits < attachment_only_total {
        problems.push(format!(
            "{}/{} attachment-only identifiers were not recovered",
            attachment_only_total - attachment_only_hits,
            attachment_only_total
        ));
    }

    if problems.is_empty() {
        println!("\nSignal extraction: OK");
        Ok(())
    } else {
        println!("\nSignal extraction: {} problem(s)", problems.len());
        for p in &problems {
            eprintln!("  ✗ {p}");
        }
        Err(format!("Signal extraction failed ({} problem(s))", problems.len()))
    }
}
