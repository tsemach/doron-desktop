//! `eval email run --mode matcher` — drive the real matcher over the corpus.
//!
//! Builds a profile with the app's own code, then calls `match_email_core` per fixture —
//! the same function the pipeline calls. Nothing is reimplemented here, so a green eval
//! means the shipped path works, not that a parallel copy of it does.

use tauri_app_lib::email::case_matcher::{CaseMatcher, MatchBand, MatcherConfig};

use tauri_app_lib::email::{
    combined_text, extract_attachment_texts, extract_email_signals, AttachmentLimits,
    AttachmentMetadata, CaseMatchPhase, CaseMatchRequest,
};

use super::corpus::EmailFixture;
use super::harness::{build_profile, BuildOptions, Profile};
use super::matcher_metrics::{
    print_report, print_threshold_sweep, summarize, Prediction, Summary,
};

/// Rebuild the request exactly as `run_email_pipeline` would, so the eval exercises the
/// same inputs: signals over subject + full body + attachment text, plus thread headers.
fn build_request(profile: &Profile, fixture: &EmailFixture) -> CaseMatchRequest {
    let staged: Vec<AttachmentMetadata> = fixture
        .attachments
        .iter()
        .map(|a| AttachmentMetadata {
            name: a.name.clone(),
            staged_path: profile
                .db_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."))
                .join(&a.path)
                .to_string_lossy()
                .to_string(),
            size_kb: 0,
            is_imported: None,
        })
        .collect();
    let attachments_json = serde_json::to_string(&staged).unwrap_or_else(|_| "[]".to_string());
    let attachment_text = combined_text(&extract_attachment_texts(
        &attachments_json,
        &AttachmentLimits::default(),
    ));

    let body = if attachment_text.is_empty() {
        fixture.body_text.clone()
    } else {
        format!("{}\n{}", fixture.body_text, attachment_text)
    };
    let sender = match &fixture.sender_name {
        Some(name) => format!("{name} <{}>", fixture.sender),
        None => fixture.sender.clone(),
    };
    let deterministic = extract_email_signals(&sender, &fixture.subject, &body);

    CaseMatchRequest {
        message_id: fixture.message_id.clone(),
        sender,
        subject: fixture.subject.clone(),
        snippet: fixture.body_text.chars().take(500).collect(),
        body_text: fixture.body_text.clone(),
        attachment_text,
        in_reply_to: fixture.in_reply_to.clone(),
        references: fixture.references.clone(),
        search_terms: deterministic.to_search_terms(),
        deterministic,
        classification: None,
        phase: CaseMatchPhase::AfterDeterministic,
    }
}

pub async fn run(
    corpus_dir: &str,
    reuse: bool,
    verbose: bool,
) -> Result<(Summary, usize, String), String> {
    let (profile, _indexed) = build_profile(corpus_dir, BuildOptions { fresh: !reuse }).await?;

    // Auto-link stays disabled (the shipping default), so bands are Review/Ignore. The
    // accuracy numbers below are about *which* case is picked, independent of banding.
    let config = MatcherConfig::load(&profile.conn);
    let config_json = serde_json::to_string(&config).unwrap_or_default();
    let review_threshold = config.review_threshold;
    let matcher = CaseMatcher::new(config);

    let mut predictions = Vec::with_capacity(profile.emails.len());
    for fixture in &profile.emails {
        let request = build_request(&profile, fixture);
        let outcome = matcher.match_email_core(&profile.conn, &request)?;

        // A ranking always has a top entry; a *link* is what the band decides. Below the
        // review threshold the pipeline neither links nor surfaces anything, so scoring an
        // Ignore-band candidate as a link would count a failure the user cannot experience.
        // Tier A alone never produced one — it only spoke when it held a hard identifier —
        // which is why this only starts to matter now that Tier B scores nearly every case.
        let top_case = outcome.best.as_ref().map(|b| b.case_id);
        let predicted_case = match outcome.band {
            MatchBand::Ignore => None,
            _ => top_case,
        };
        let confidence = outcome.best.as_ref().map(|b| b.confidence).unwrap_or(0.0);
        let signals = outcome
            .best
            .as_ref()
            .map(|b| b.signals.iter().map(|s| s.name.to_string()).collect())
            .unwrap_or_default();

        // Rank of the expected case among all candidates, for MRR.
        let rank_of_expected = fixture.expected.case_id.and_then(|want| {
            std::iter::once(outcome.best.as_ref())
                .flatten()
                .chain(outcome.runners_up.iter())
                .position(|c| c.case_id == want)
        });

        predictions.push(Prediction {
            fixture_id: fixture.id.clone(),
            expected_case: fixture.expected.case_id,
            competing_case: fixture.expected.competing_case_id,
            predicted_case,
            top_case,
            confidence,
            band: outcome.band,
            rank_of_expected,
            difficulty: fixture.expected.difficulty,
            practice: fixture.expected.practice,
            signals,
            explanation: outcome.explanation.lines().next().unwrap_or("").to_string(),
        });
    }

    let summary = summarize(&profile.emails, &predictions);
    print_report(&summary, profile.cases.len());

    if verbose {
        print_threshold_sweep(&summary, review_threshold);
        if !summary.failures.is_empty() {
            println!("\nFailures");
            for f in &summary.failures {
                println!("  {f}");
            }
        }
    }
    Ok((summary, profile.cases.len(), config_json))
}
