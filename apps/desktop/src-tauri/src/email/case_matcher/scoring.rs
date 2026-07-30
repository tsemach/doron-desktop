//! Aggregation, banding, and the ambiguity guard (design §5.6).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::config::MatcherConfig;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MatchBand {
    AutoLink,
    Review,
    Ignore,
}

impl MatchBand {
    pub fn label(self) -> &'static str {
        match self {
            MatchBand::AutoLink => "AutoLink",
            MatchBand::Review => "Review",
            MatchBand::Ignore => "Ignore",
        }
    }
}

/// One signal's contribution to a case's score, kept for the explanation and for the
/// eval's per-signal breakdown.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct SignalContribution {
    pub tier: &'static str,
    pub name: &'static str,
    pub raw: f64,
    pub weighted: f64,
    pub detail: String,
    /// A signal that can settle the match on its own when it resolves to one case.
    pub decisive: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct CaseCandidate {
    pub case_id: i64,
    pub confidence: f64,
    pub signals: Vec<SignalContribution>,
}

impl CaseCandidate {
    pub fn has_decisive(&self) -> bool {
        self.signals.iter().any(|s| s.decisive)
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct CaseMatchOutcome {
    pub best: Option<CaseCandidate>,
    pub runners_up: Vec<CaseCandidate>,
    pub band: MatchBand,
    pub explanation: String,
    /// True when the guard demoted the band because the top two were too close.
    pub ambiguous: bool,
}

impl CaseMatchOutcome {
    pub fn none(reason: impl Into<String>) -> Self {
        Self {
            best: None,
            runners_up: Vec::new(),
            band: MatchBand::Ignore,
            explanation: reason.into(),
            ambiguous: false,
        }
    }
}

/// Combine per-case signal contributions into ranked candidates.
///
/// Within one signal name only the strongest contribution counts — two party names
/// matching the same case is not twice the evidence of one, and letting them stack would
/// let a case with many weak signals outrank one with a decisive identifier.
pub fn aggregate(contributions: Vec<(i64, SignalContribution)>) -> Vec<CaseCandidate> {
    let mut by_case: BTreeMap<i64, BTreeMap<&'static str, SignalContribution>> = BTreeMap::new();

    for (case_id, contribution) in contributions {
        let entry = by_case.entry(case_id).or_default();
        match entry.get(contribution.name) {
            Some(existing) if existing.weighted >= contribution.weighted => {}
            _ => {
                entry.insert(contribution.name, contribution);
            }
        }
    }

    let mut candidates: Vec<CaseCandidate> = by_case
        .into_iter()
        .map(|(case_id, signals)| {
            let signals: Vec<SignalContribution> = signals.into_values().collect();
            let confidence = signals.iter().map(|s| s.weighted).sum::<f64>().clamp(0.0, 1.0);
            CaseCandidate {
                case_id,
                confidence,
                signals,
            }
        })
        .collect();

    // Highest confidence first; ties broken by case id so output is deterministic.
    candidates.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.case_id.cmp(&b.case_id))
    });
    candidates
}

/// Rank candidates and assign a band.
///
/// The ambiguity guard is the important rule here: when the top two candidates are
/// within `ambiguity_margin`, the band is demoted to `Review` no matter how high the
/// absolute score. Auto-linking to the wrong matter is the one failure a user cannot
/// easily undo, so the tie is handed to a human rather than guessed.
/// Float subtraction makes an exactly-at-margin gap land fractionally *under* it
/// (0.95 - 0.80 = 0.1499999999999999), which would flag a deliberate boundary as
/// ambiguous. The tolerance makes the comparison behave as written.
const MARGIN_EPSILON: f64 = 1e-9;

pub fn decide(mut candidates: Vec<CaseCandidate>, config: &MatcherConfig) -> CaseMatchOutcome {
    if candidates.is_empty() {
        return CaseMatchOutcome::none("No candidate case matched any signal.");
    }

    let best = candidates.remove(0);
    let runner_up_confidence = candidates.first().map(|c| c.confidence).unwrap_or(0.0);
    let ambiguous = !candidates.is_empty()
        && (best.confidence - runner_up_confidence) < config.ambiguity_margin - MARGIN_EPSILON;

    let band = if best.confidence < config.review_threshold {
        MatchBand::Ignore
    } else if best.confidence >= config.auto_link_threshold
        && config.auto_link_enabled
        && !ambiguous
    {
        MatchBand::AutoLink
    } else {
        MatchBand::Review
    };

    // Keep only genuinely competitive runners-up; a long tail of 0.05 scores is noise.
    let runners_up: Vec<CaseCandidate> = candidates
        .into_iter()
        .filter(|c| c.confidence >= config.review_threshold * 0.5)
        .take(3)
        .collect();

    CaseMatchOutcome {
        explanation: String::new(), // filled in by explain::describe
        best: Some(best),
        runners_up,
        band,
        ambiguous,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(name: &'static str, weighted: f64, decisive: bool) -> SignalContribution {
        SignalContribution {
            tier: "A",
            name,
            raw: 1.0,
            weighted,
            detail: String::new(),
            decisive,
        }
    }

    fn config() -> MatcherConfig {
        MatcherConfig {
            auto_link_enabled: true,
            ..Default::default()
        }
    }

    #[test]
    fn sums_distinct_signals_for_one_case() {
        let out = aggregate(vec![
            (1, sig("case_number", 0.5, true)),
            (1, sig("sender_confirmed", 0.3, false)),
        ]);
        assert_eq!(out.len(), 1);
        assert!((out[0].confidence - 0.8).abs() < 1e-9);
    }

    #[test]
    fn repeated_signal_does_not_stack() {
        // Three party names hitting one case is not three times the evidence.
        let out = aggregate(vec![
            (1, sig("party_name", 0.2, false)),
            (1, sig("party_name", 0.2, false)),
            (1, sig("party_name", 0.2, false)),
        ]);
        assert!((out[0].confidence - 0.2).abs() < 1e-9);
    }

    #[test]
    fn repeated_signal_keeps_the_strongest() {
        let out = aggregate(vec![
            (1, sig("land_registry", 0.4, true)),
            (1, sig("land_registry", 0.9, true)),
        ]);
        assert!((out[0].confidence - 0.9).abs() < 1e-9);
    }

    #[test]
    fn confidence_is_clamped_to_one() {
        let out = aggregate(vec![
            (1, sig("thread_ref", 1.0, true)),
            (1, sig("case_number", 0.95, true)),
        ]);
        assert!((out[0].confidence - 1.0).abs() < 1e-9);
    }

    #[test]
    fn candidates_rank_by_confidence_then_case_id() {
        let out = aggregate(vec![
            (7, sig("a", 0.5, false)),
            (3, sig("a", 0.5, false)),
            (9, sig("a", 0.9, false)),
        ]);
        assert_eq!(out[0].case_id, 9);
        assert_eq!(out[1].case_id, 3, "ties must break deterministically by id");
        assert_eq!(out[2].case_id, 7);
    }

    #[test]
    fn clear_winner_auto_links() {
        let candidates = aggregate(vec![
            (1, sig("case_number", 0.95, true)),
            (2, sig("party_name", 0.20, false)),
        ]);
        let out = decide(candidates, &config());
        assert_eq!(out.band, MatchBand::AutoLink);
        assert_eq!(out.best.unwrap().case_id, 1);
        assert!(!out.ambiguous);
    }

    /// The guard that stops a wrong auto-link: two near-equal candidates go to a human
    /// however confident the top one looks.
    #[test]
    fn near_tie_is_demoted_to_review() {
        let candidates = aggregate(vec![
            (1, sig("case_number", 0.95, true)),
            (2, sig("case_number", 0.90, true)),
        ]);
        let out = decide(candidates, &config());
        assert!(out.ambiguous);
        assert_eq!(out.band, MatchBand::Review, "0.05 apart must not auto-link");
    }

    #[test]
    fn margin_boundary_is_respected() {
        let mut cfg = config();
        cfg.ambiguity_margin = 0.15;
        // Exactly at the margin is not ambiguous (strict less-than).
        let out = decide(
            aggregate(vec![(1, sig("a", 0.95, true)), (2, sig("a", 0.80, true))]),
            &cfg,
        );
        assert!(!out.ambiguous);
        assert_eq!(out.band, MatchBand::AutoLink);
    }

    #[test]
    fn below_review_threshold_is_ignored() {
        let out = decide(aggregate(vec![(1, sig("phone", 0.20, false))]), &config());
        assert_eq!(out.band, MatchBand::Ignore);
    }

    #[test]
    fn auto_link_disabled_caps_at_review() {
        let cfg = MatcherConfig::default(); // auto_link_enabled = false
        let out = decide(aggregate(vec![(1, sig("thread_ref", 1.0, true))]), &cfg);
        assert_eq!(
            out.band,
            MatchBand::Review,
            "shipping default must never auto-link"
        );
    }

    #[test]
    fn no_candidates_yields_ignore() {
        let out = decide(vec![], &config());
        assert_eq!(out.band, MatchBand::Ignore);
        assert!(out.best.is_none());
    }

    #[test]
    fn weak_runners_up_are_dropped() {
        let candidates = aggregate(vec![
            (1, sig("case_number", 0.95, true)),
            (2, sig("phone", 0.30, false)),
            (3, sig("phone", 0.05, false)),
        ]);
        let out = decide(candidates, &config());
        let ids: Vec<i64> = out.runners_up.iter().map(|c| c.case_id).collect();
        assert!(ids.contains(&2));
        assert!(!ids.contains(&3), "noise-level candidate should be dropped");
    }
}
