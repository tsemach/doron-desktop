//! Human-readable explanation of a match (design §5.7).
//!
//! Written into the existing `pending_email_alerts.reason` column — no schema or display
//! change. It is also the tuning surface: without a per-signal breakdown, choosing
//! weights is guesswork, and the eval report leans on it to show *why* a case won.

use super::scoring::{CaseMatchOutcome, SignalContribution};

fn marker(signal: &SignalContribution) -> &'static str {
    if signal.decisive {
        "✓"
    } else {
        "~"
    }
}

fn describe_signals(signals: &[SignalContribution]) -> Vec<String> {
    let mut sorted: Vec<&SignalContribution> = signals.iter().collect();
    sorted.sort_by(|a, b| {
        b.weighted
            .partial_cmp(&a.weighted)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    sorted
        .iter()
        .map(|s| {
            format!(
                "  {} {:<22} {:<44} +{:.2}",
                marker(s),
                s.name,
                s.detail,
                s.weighted
            )
        })
        .collect()
}

pub fn describe(outcome: &CaseMatchOutcome) -> String {
    let Some(best) = &outcome.best else {
        return outcome.explanation.clone();
    };

    let mut lines = vec![format!(
        "Matched case #{} (confidence {:.2}, band {})",
        best.case_id,
        best.confidence,
        outcome.band.label()
    )];
    lines.extend(describe_signals(&best.signals));

    if outcome.ambiguous {
        lines.push(
            "  ! ambiguous: the next candidate is too close to link automatically".to_string(),
        );
    }
    for runner in &outcome.runners_up {
        lines.push(format!(
            "  runner-up: case #{} ({:.2})",
            runner.case_id, runner.confidence
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::scoring::{CaseCandidate, MatchBand};

    fn sig(name: &'static str, weighted: f64, decisive: bool, detail: &str) -> SignalContribution {
        SignalContribution {
            tier: "A",
            name,
            raw: 1.0,
            weighted,
            detail: detail.to_string(),
            decisive,
        }
    }

    fn outcome() -> CaseMatchOutcome {
        CaseMatchOutcome {
            best: Some(CaseCandidate {
                case_id: 42,
                confidence: 0.91,
                signals: vec![
                    sig("sender_confirmed", 0.18, false, "adv@lawfirm.co.il"),
                    sig("case_number", 0.45, true, "case number 12345/23"),
                ],
            }),
            runners_up: vec![CaseCandidate {
                case_id: 17,
                confidence: 0.31,
                signals: vec![],
            }],
            band: MatchBand::Review,
            explanation: String::new(),
            ambiguous: false,
        }
    }

    #[test]
    fn leads_with_the_case_confidence_and_band() {
        let text = describe(&outcome());
        assert!(text.starts_with("Matched case #42 (confidence 0.91, band Review)"));
    }

    #[test]
    fn lists_signals_strongest_first() {
        let text = describe(&outcome());
        let cn = text.find("case_number").unwrap();
        let sender = text.find("sender_confirmed").unwrap();
        assert!(cn < sender, "strongest contribution should be listed first");
    }

    #[test]
    fn marks_decisive_signals_distinctly() {
        let text = describe(&outcome());
        assert!(text.contains("✓ case_number"));
        assert!(text.contains("~ sender_confirmed"));
    }

    #[test]
    fn mentions_runners_up() {
        assert!(describe(&outcome()).contains("runner-up: case #17 (0.31)"));
    }

    #[test]
    fn calls_out_ambiguity() {
        let mut o = outcome();
        o.ambiguous = true;
        assert!(describe(&o).contains("ambiguous"));
    }

    #[test]
    fn falls_back_to_the_plain_reason_when_nothing_matched() {
        let o = CaseMatchOutcome::none("No candidate case matched any signal.");
        assert_eq!(describe(&o), "No candidate case matched any signal.");
    }
}
