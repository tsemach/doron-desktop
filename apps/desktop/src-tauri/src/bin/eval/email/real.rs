//! `eval email real` — run the matcher over real mail exported from the live account.
//!
//! This is the check the synthetic corpus cannot make. The generator encodes the same
//! assumptions about Israeli legal mail that the matcher encodes, so a green synthetic run
//! only confirms those assumptions; it can never challenge them (design §10.8).
//!
//! **There is no ground truth here.** Real mail has no labels, so nothing is scored and
//! nothing passes or fails. The output is a worksheet: what the matcher proposed, why, and
//! how confident it was, ordered so the calls worth checking come first. Reading it is the
//! measurement.
//!
//! Export the mail with `scripts/gmail_export.py`, which reads without marking anything
//! read.

use clap::Args;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use tauri_app_lib::case::{case_text_index, documents_link, identifiers};
use tauri_app_lib::email::case_matcher::{CaseMatcher, MatchBand, MatcherConfig};
use tauri_app_lib::email::{
    combined_text, extract_attachment_texts, extract_email_signals, AttachmentLimits,
    AttachmentMetadata, CaseMatchPhase, CaseMatchRequest,
};
use tauri_app_lib::store;

#[derive(Args, Debug, Clone)]
pub struct RealArgs {
    /// Emails exported by `scripts/gmail_export.py`
    #[arg(long, default_value = "./real_emails.json")]
    pub emails: String,

    /// The app profile database to match against
    #[arg(long)]
    pub db: Option<String>,

    /// Work on the live profile instead of a copy.
    ///
    /// Off by default: opening the database applies the matcher migrations and the backfill
    /// writes identifier rows, so a plain read-only-looking run would in fact modify the
    /// real profile. A copy makes this safe to run at any time.
    #[arg(long)]
    pub in_place: bool,

    /// Show every email, not just the ones the matcher acted on
    #[arg(long)]
    pub all: bool,

    /// How many to print in full
    #[arg(long, default_value = "25")]
    pub show: usize,
}

#[derive(Deserialize)]
struct Export {
    account: String,
    days: u32,
    emails: Vec<RealEmail>,
}

#[derive(Deserialize)]
struct RealEmail {
    message_id: String,
    sender: String,
    sender_name: Option<String>,
    subject: String,
    body_text: String,
    #[serde(default)]
    in_reply_to: Option<String>,
    #[serde(default)]
    references: Vec<String>,
    #[serde(default)]
    attachments: Vec<RealAttachment>,
    #[serde(default)]
    was_unread: bool,
}

#[derive(Deserialize)]
struct RealAttachment {
    name: String,
    #[serde(default)]
    size_kb: i64,
    /// Only present when exported with `--with-attachments`.
    #[serde(default)]
    path: Option<String>,
}

fn default_profile() -> PathBuf {
    store::cli_app_data_dir().join("documents.db")
}

/// Copy the profile so migrations and backfill cannot touch the real one.
///
/// SQLite keeps recent writes in `-wal`, so copying only the main file can silently lose
/// them; both sidecars come along.
fn snapshot(source: &Path) -> Result<PathBuf, String> {
    let dir = store::cli_app_data_dir().join("eval_real_snapshot");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join("profile.db");
    for suffix in ["", "-wal", "-shm"] {
        let from = PathBuf::from(format!("{}{suffix}", source.display()));
        let to = PathBuf::from(format!("{}{suffix}", target.display()));
        let _ = std::fs::remove_file(&to);
        if from.exists() {
            std::fs::copy(&from, &to)
                .map_err(|e| format!("Failed to copy {}: {e}", from.display()))?;
        }
    }
    Ok(target)
}

fn build_request(email: &RealEmail) -> CaseMatchRequest {
    let staged: Vec<AttachmentMetadata> = email
        .attachments
        .iter()
        .filter_map(|a| {
            a.path.as_ref().map(|p| AttachmentMetadata {
                name: a.name.clone(),
                staged_path: p.clone(),
                size_kb: a.size_kb,
                is_imported: None,
            })
        })
        .collect();
    let attachment_text = if staged.is_empty() {
        String::new()
    } else {
        let json = serde_json::to_string(&staged).unwrap_or_else(|_| "[]".to_string());
        combined_text(&extract_attachment_texts(&json, &AttachmentLimits::default()))
    };

    let sender = match &email.sender_name {
        Some(name) if !name.is_empty() => format!("{name} <{}>", email.sender),
        _ => email.sender.clone(),
    };
    let body = if attachment_text.is_empty() {
        email.body_text.clone()
    } else {
        format!("{}\n{}", email.body_text, attachment_text)
    };
    let deterministic = extract_email_signals(&sender, &email.subject, &body);

    CaseMatchRequest {
        message_id: email.message_id.clone(),
        sender,
        subject: email.subject.clone(),
        snippet: email.body_text.chars().take(500).collect(),
        body_text: email.body_text.clone(),
        attachment_text,
        in_reply_to: email.in_reply_to.clone(),
        references: email.references.clone(),
        search_terms: deterministic.to_search_terms(),
        deterministic,
        classification: None,
        phase: CaseMatchPhase::AfterDeterministic,
    }
}

/// Subjects are real client matters; truncate so a terminal or a pasted log leaks less.
fn short(text: &str, chars: usize) -> String {
    let trimmed: String = text.chars().take(chars).collect();
    if text.chars().count() > chars {
        format!("{trimmed}…")
    } else {
        trimmed
    }
}

pub async fn execute(args: RealArgs) -> Result<(), String> {
    let raw = std::fs::read_to_string(&args.emails).map_err(|e| {
        format!(
            "Cannot read {}: {e}\nExport first: python3 apps/desktop/src-tauri/scripts/gmail_export.py --out {}",
            args.emails, args.emails
        )
    })?;
    let export: Export =
        serde_json::from_str(&raw).map_err(|e| format!("{} is not a valid export: {e}", args.emails))?;

    let live = args.db.map(PathBuf::from).unwrap_or_else(default_profile);
    if !live.exists() {
        return Err(format!("Profile database not found: {}", live.display()));
    }
    let db_path = if args.in_place {
        println!("⚠ Running against the LIVE profile — migrations and backfill will write to it.");
        live
    } else {
        let copy = snapshot(&live)?;
        println!("Working on a copy of {} (use --in-place to change that)", live.display());
        copy
    };

    // Opening applies the matcher migrations; the index builders then populate them. This
    // is the first time either has run against real data, so failures here are the point.
    let conn = store::open_db_by_path(&db_path)?;
    let identifiers_built = identifiers::rebuild_all_case_identifiers(&conn)?;
    let cases_indexed = case_text_index::rebuild_all_case_text_fts(&conn)?;
    let documents_linked = documents_link::backfill_document_case_ids(&conn)?;

    let case_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM cases WHERE deleted = 0 OR deleted IS NULL", [], |r| r.get(0))
        .unwrap_or(0);

    println!(
        "\nProfile: {case_count} case(s), {identifiers_built} identifier(s), \
         {cases_indexed} case text row(s), {documents_linked} document(s) linked to a case"
    );
    println!(
        "Mail:    {} email(s) from {} over the last {} days\n",
        export.emails.len(),
        export.account,
        export.days
    );
    if documents_linked == 0 {
        println!("Note: no document resolved to a case folder, so Tier B has only case text to work with.\n");
    }

    let config = MatcherConfig::load(&conn);
    let matcher = CaseMatcher::new(config.clone());

    let mut bands: BTreeMap<&str, usize> = BTreeMap::new();
    let mut signal_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut rows: Vec<(f64, String)> = Vec::new();
    let mut unread_touched = 0;

    for email in &export.emails {
        let outcome = matcher.match_email_core(&conn, &build_request(email))?;
        let band = match outcome.band {
            MatchBand::AutoLink => "auto-link",
            MatchBand::Review => "review",
            MatchBand::Ignore => "ignore",
        };
        *bands.entry(band).or_insert(0) += 1;

        let Some(best) = outcome.best.as_ref() else {
            continue;
        };
        for s in &best.signals {
            *signal_counts.entry(s.name.to_string()).or_insert(0) += 1;
        }
        if outcome.band == MatchBand::Ignore && !args.all {
            continue;
        }
        if email.was_unread {
            unread_touched += 1;
        }

        let subject: i64 = conn
            .query_row("SELECT id FROM cases WHERE id = ?1", [best.case_id], |r| r.get(0))
            .unwrap_or(best.case_id);
        let case_name: String = conn
            .query_row(
                "SELECT COALESCE(NULLIF(subject,''), name, '?') FROM cases WHERE id = ?1",
                [subject],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "?".into());

        let detail = best
            .signals
            .iter()
            .map(|s| format!("{}={:.2}", s.name, s.weighted))
            .collect::<Vec<_>>()
            .join(" ");

        rows.push((
            best.confidence,
            format!(
                "  [{:>9}] {:.2}  {}\n      email : {}\n      case  : #{} {}\n      why   : {}{}",
                band,
                best.confidence,
                if email.was_unread { "(unread)" } else { "" },
                short(&email.subject, 68),
                best.case_id,
                short(&case_name, 58),
                detail,
                if outcome.ambiguous { "  ⚠ ambiguous — a competing case scored close" } else { "" }
            ),
        ));
    }

    println!("--- What the matcher would do ---");
    for (band, n) in &bands {
        let pct = *n as f64 / export.emails.len().max(1) as f64 * 100.0;
        println!("  {band:<10} {n:>4}  ({pct:>5.1}%)");
    }
    if !signal_counts.is_empty() {
        println!("\n--- Signals behind the top candidate ---");
        for (name, n) in &signal_counts {
            println!("  {name:<24} {n:>4}");
        }
    }

    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    println!(
        "\n--- {} proposed match(es), strongest first ---",
        rows.len()
    );
    if rows.is_empty() {
        println!("  None. Either this mail is unrelated to any case, or no signal reached the");
        println!("  review threshold ({:.2}).", config.review_threshold);
    }
    for (_, row) in rows.iter().take(args.show) {
        println!("{row}");
    }
    if rows.len() > args.show {
        println!("\n  … {} more (use --show {})", rows.len() - args.show, rows.len());
    }

    println!(
        "\nNo ground truth exists for real mail, so nothing here is scored. Check the matches\n\
         above by hand: every one that is wrong is a bug the synthetic corpus cannot see.\n\
         {unread_touched} of the proposals are for emails that are still unread in Gmail."
    );
    Ok(())
}
