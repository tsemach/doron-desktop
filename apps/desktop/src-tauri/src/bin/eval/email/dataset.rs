//! Email classification benchmark harness (fixtures, scoring, reporting).
//! Lives in the eval binary only — mirrors `document/run.rs` eval helpers.

use std::fs;
use std::path::Path;

use serde::Deserialize;
use tauri_app_lib::{
    email::{classify_email_llm, EmailClassification},
    llm::llm_provider::LlmProvider,
};

#[derive(Deserialize, Debug)]
struct ExpectedOutcome {
    review: bool,
    #[serde(default)]
    search_terms: Vec<String>,
}

#[derive(Deserialize, Debug)]
pub(super) struct EmailEvalFixture {
    pub id: String,
    pub sender: String,
    pub subject: String,
    pub snippet: String,
    /// Pre-baked LLM output for --inject-only / CI (no live LLM).
    pub injected: EmailClassification,
    expected: ExpectedOutcome,
}

#[derive(Debug, Clone)]
pub(super) struct EmailEvalOutcome {
    _fixture_id: String,
    classification: EmailClassification,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TermMatchKind {
    Exact,
    Fuzzy(String),
    Miss,
}

#[derive(Debug, Default)]
struct SearchTermDetail {
    exact: usize,
    fuzzy: usize,
    missed: usize,
    extra: usize,
}

#[derive(Debug, Default)]
pub(super) struct EmailEvalSummary {
    pub review_correct: usize,
    pub review_total: usize,
    pub false_positives: usize,
    pub false_negatives: usize,
    pub failures: Vec<String>,
}

pub(super) fn load_fixtures(path: &Path) -> Result<Vec<EmailEvalFixture>, String> {
    let data =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse fixture JSON: {e}"))
}

async fn evaluate_email_fixture(
    provider: &LlmProvider,
    fixture_id: &str,
    sender: &str,
    subject: &str,
    snippet: &str,
    inject_only: bool,
    injected: Option<&EmailClassification>,
) -> Result<EmailEvalOutcome, String> {
    let classification = if inject_only {
        injected.cloned().ok_or_else(|| {
            format!("Fixture '{fixture_id}' missing injected classification for --inject-only mode")
        })?
    } else {
        classify_email_llm(provider, sender, subject, snippet).await?
    };

    Ok(EmailEvalOutcome {
        _fixture_id: fixture_id.to_string(),
        classification,
    })
}

pub(super) async fn run_fixture_suite(
    provider: &LlmProvider,
    fixtures: &[EmailEvalFixture],
    inject_only: bool,
) -> Result<Vec<EmailEvalOutcome>, String> {
    let mut outcomes = Vec::with_capacity(fixtures.len());
    for fixture in fixtures {
        let outcome = evaluate_email_fixture(
            provider,
            &fixture.id,
            &fixture.sender,
            &fixture.subject,
            &fixture.snippet,
            inject_only,
            Some(&fixture.injected),
        )
        .await?;
        outcomes.push(outcome);
    }
    Ok(outcomes)
}

fn norm_token(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .replace(['\'', '"', '׳', '״'], "")
}

fn classify_term(expected: &str, predicted: &[String]) -> TermMatchKind {
    let norm_exp = norm_token(expected);
    if norm_exp.is_empty() {
        return TermMatchKind::Miss;
    }

    for p in predicted {
        if norm_token(p) == norm_exp {
            return TermMatchKind::Exact;
        }
    }

    for p in predicted {
        let norm_p = norm_token(p);
        if norm_p.is_empty() {
            continue;
        }
        if norm_exp.contains(&norm_p) || norm_p.contains(&norm_exp) {
            return TermMatchKind::Fuzzy(p.clone());
        }
    }

    TermMatchKind::Miss
}

fn predicted_term_used(expected: &[String], predicted: &str) -> bool {
    let norm_p = norm_token(predicted);
    if norm_p.is_empty() {
        return true;
    }
    expected.iter().any(|e| {
        let norm_e = norm_token(e);
        norm_e == norm_p || norm_e.contains(&norm_p) || norm_p.contains(&norm_e)
    })
}

fn print_search_terms_diff(
    fixture_id: &str,
    expected: &[String],
    predicted: &[String],
    detail: &mut SearchTermDetail,
) {
    if expected.is_empty() && predicted.is_empty() {
        return;
    }

    println!("         search_terms [{fixture_id}]:");
    for term in expected {
        let norm = term.trim();
        if norm.is_empty() {
            continue;
        }
        match classify_term(norm, predicted) {
            TermMatchKind::Exact => {
                detail.exact += 1;
                println!("           ✓ exact:      {norm}");
            }
            TermMatchKind::Fuzzy(got) => {
                detail.fuzzy += 1;
                println!("           ~ fuzzy:      {norm}  →  got \"{got}\"");
            }
            TermMatchKind::Miss => {
                detail.missed += 1;
                println!("           ✗ miss:       {norm}");
            }
        }
    }

    let extras: Vec<_> = predicted
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .filter(|p| !predicted_term_used(expected, p))
        .collect();

    if !extras.is_empty() {
        detail.extra += extras.len();
        println!("           + extra:      {}", extras.join(", "));
    }

    if !predicted.is_empty() {
        println!("           got order:    {}", predicted.join(" > "));
    } else if !expected.is_empty() {
        println!("           (LLM returned no search_terms)");
    }
}

pub(super) fn summarize(
    fixtures: &[EmailEvalFixture],
    outcomes: &[EmailEvalOutcome],
) -> EmailEvalSummary {
    let mut summary = EmailEvalSummary {
        review_total: fixtures.len(),
        ..Default::default()
    };

    for (fixture, outcome) in fixtures.iter().zip(outcomes.iter()) {
        let predicted = outcome.classification.review;
        let expected = fixture.expected.review;

        if predicted == expected {
            summary.review_correct += 1;
        } else if predicted && !expected {
            summary.false_positives += 1;
            summary.failures.push(format!(
                "[{}] FALSE POSITIVE: surfaced for review but should be ignored | reason={}",
                fixture.id, outcome.classification.review_reason
            ));
        } else {
            summary.false_negatives += 1;
            summary.failures.push(format!(
                "[{}] FALSE NEGATIVE: missed business email (should have surfaced) | reason={}",
                fixture.id, outcome.classification.review_reason
            ));
        }
    }

    summary
}

pub(super) fn print_report(
    summary: &EmailEvalSummary,
    outcomes: &[EmailEvalOutcome],
    fixtures: &[EmailEvalFixture],
) {
    let mut term_detail = SearchTermDetail::default();

    for (fixture, outcome) in fixtures.iter().zip(outcomes.iter()) {
        println!(
            "  [{}] review={} (exp {}) | {}",
            fixture.id,
            outcome.classification.review,
            fixture.expected.review,
            outcome.classification.review_reason
        );
        if !outcome.classification.summary.is_empty() {
            println!("         summary: {}", outcome.classification.summary);
        }

        print_search_terms_diff(
            &fixture.id,
            &fixture.expected.search_terms,
            &outcome.classification.search_terms,
            &mut term_detail,
        );
    }

    let review_pct = (summary.review_correct as f64 / summary.review_total as f64) * 100.0;

    println!("\n--- Results ---");
    println!(
        "Review decision:      {}/{} ({review_pct:.0}%)",
        summary.review_correct, summary.review_total
    );
    println!(
        "  false positives:    {} (surfaced but should ignore)",
        summary.false_positives
    );
    println!(
        "  false negatives:    {} (missed business email)",
        summary.false_negatives
    );

    let total = term_detail.exact + term_detail.fuzzy + term_detail.missed;
    if total > 0 {
        println!("\nSearch terms (informational):");
        println!(
            "  exact:  {}  fuzzy:  {}  miss:  {}  extra:  {}",
            term_detail.exact, term_detail.fuzzy, term_detail.missed, term_detail.extra
        );
        let recall = (term_detail.exact + term_detail.fuzzy) as f64 / total as f64 * 100.0;
        println!("  recall (exact+fuzzy): {recall:.0}%");
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn term_exact_match() {
        assert_eq!(
            classify_term("דיון", &["דיון".to_string(), "12345/23".to_string()]),
            TermMatchKind::Exact
        );
    }

    #[test]
    fn term_fuzzy_substring_match() {
        assert!(matches!(
            classify_term("עדכון", &["עדכון תיק".to_string()]),
            TermMatchKind::Fuzzy(_)
        ));
    }

    #[test]
    fn term_miss_when_absent() {
        assert_eq!(
            classify_term("דיון", &["חשבונית".to_string()]),
            TermMatchKind::Miss
        );
    }
}
