//! Threshold/weight grid search and per-signal ablation (design §6.3, plan P6).
//!
//! **Shipped defaults must come from here, not from judgement.** Every constant in
//! `MatcherConfig` started as an informed guess; this replaces them with a recorded
//! operating point, and records the run id so the choice is auditable.
//!
//! The search re-scores cached contributions rather than re-running the matcher: tiers are
//! collected once per email, and each grid point only re-derives `weighted` from `raw`,
//! re-aggregates and re-bands. A 100-point grid is one database pass, not a hundred.

use tauri_app_lib::email::case_matcher::{CaseMatcher, MatcherConfig, SignalContribution};

use super::corpus::EmailFixture;
use super::matcher_metrics::{summarize, Prediction, Summary};

/// One email's tier output, collected once and re-scored for every grid point.
pub struct Scored {
    pub fixture: EmailFixture,
    pub contributions: Vec<(i64, SignalContribution)>,
}

/// Which signals a scoring pass may use.
#[derive(Clone, Copy)]
pub enum Signals<'a> {
    All,
    /// Everything except these — marginal contribution, given the others.
    Without(&'a [&'a str]),
    /// This one alone — standalone power, independent of the others.
    Only(&'a str),
}

impl Signals<'_> {
    fn admits(&self, name: &str) -> bool {
        match self {
            Signals::All => true,
            Signals::Without(names) => !names.contains(&name),
            Signals::Only(keep) => *keep == name,
        }
    }
}

/// Re-score one email under a config, using only the admitted signals.
///
/// `weighted` is recomputed from `raw` rather than reused, which is what lets the grid vary
/// weights and not just thresholds — the P5 result that `content` cannot reach the review
/// threshold under the shipped weights is a weights question, so a threshold-only sweep
/// would have been unable to answer it. That recomputation is also why every tier must keep
/// `weighted == raw * weight`; Tier C briefly did not, and this scored it 75% too high.
fn predict(scored: &Scored, config: &MatcherConfig, signals: Signals) -> Prediction {
    let contributions: Vec<(i64, SignalContribution)> = scored
        .contributions
        .iter()
        .filter(|(_, s)| signals.admits(s.name))
        .map(|(case_id, s)| {
            let mut s = s.clone();
            if let Some(weight) = config.weights.get(s.name) {
                s.weighted = s.raw * weight;
            }
            (*case_id, s)
        })
        .collect();

    let outcome = CaseMatcher::new(config.clone()).decide(contributions);
    let expected = scored.fixture.expected.case_id;

    let top_case = outcome.best.as_ref().map(|b| b.case_id);
    let predicted_case = match outcome.band {
        tauri_app_lib::email::case_matcher::MatchBand::Ignore => None,
        _ => top_case,
    };
    let rank_of_expected = expected.and_then(|want| {
        std::iter::once(outcome.best.as_ref())
            .flatten()
            .chain(outcome.runners_up.iter())
            .position(|c| c.case_id == want)
    });

    Prediction {
        fixture_id: scored.fixture.id.clone(),
        expected_case: expected,
        competing_case: scored.fixture.expected.competing_case_id,
        also_matches: scored.fixture.expected.also_matches.clone(),
        predicted_case,
        top_case,
        confidence: outcome.best.as_ref().map(|b| b.confidence).unwrap_or(0.0),
        band: outcome.band,
        rank_of_expected,
        difficulty: scored.fixture.expected.difficulty,
        practice: scored.fixture.expected.practice,
        signals: outcome
            .best
            .as_ref()
            .map(|b| b.signals.iter().map(|s| s.name.to_string()).collect())
            .unwrap_or_default(),
        explanation: String::new(),
    }
}

pub fn score_all(scored: &[Scored], config: &MatcherConfig, signals: Signals) -> Summary {
    let predictions: Vec<Prediction> = scored
        .iter()
        .map(|s| predict(s, config, signals))
        .collect();
    let fixtures: Vec<EmailFixture> = scored.iter().map(|s| s.fixture.clone()).collect();
    summarize(&fixtures, &predictions)
}

pub struct GridPoint {
    pub review_threshold: f64,
    pub content_weight: f64,
    pub ambiguity_margin: f64,
    pub summary: Summary,
}

impl GridPoint {
    pub fn config_from(&self, base: &MatcherConfig) -> MatcherConfig {
        let mut config = base.clone();
        config.review_threshold = self.review_threshold;
        config.ambiguity_margin = self.ambiguity_margin;
        config.weights.set("content", self.content_weight);
        config
    }
}

/// Search review threshold × content weight × ambiguity margin.
///
/// `content` is the swept weight because it is the only one P5 left open: the identifier
/// weights are already validated by `easy`/`thread`/`adversarial` sitting at 100%, whereas
/// `hard` is entirely gated on whether a content-only match can reach Review.
pub fn run_grid(scored: &[Scored], base: &MatcherConfig) -> Vec<GridPoint> {
    let mut points = Vec::new();
    for review in [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55] {
        for content in [0.50, 0.60, 0.70, 0.80, 0.90, 1.00] {
            for margin in [0.10, 0.15, 0.20] {
                let point = GridPoint {
                    review_threshold: review,
                    content_weight: content,
                    ambiguity_margin: margin,
                    summary: Summary::default(),
                };
                let config = point.config_from(base);
                points.push(GridPoint {
                    summary: score_all(scored, &config, Signals::All),
                    ..point
                });
            }
        }
    }
    points
}

/// How far a grid point moves the shipped constants. Ties break towards the smallest move.
fn distance_from(point: &GridPoint, base: &MatcherConfig) -> f64 {
    (point.review_threshold - base.review_threshold).abs()
        + (point.content_weight - base.weights.content).abs()
        + (point.ambiguity_margin - base.ambiguity_margin).abs()
}

/// The point to ship: highest recall among those that mislink nothing.
///
/// Not the F1 optimum. F1 will trade a mislink for two recovered matches, and a mislink is
/// the one failure a user cannot undo — so it is a constraint, not a term in the objective.
///
/// Ties break towards the *current defaults*. Several settings scoring identically on one
/// corpus is not evidence for changing a shipped constant, and picking whichever corner the
/// grid happened to visit first would dress an arbitrary choice up as a measured one.
pub fn best_safe<'a>(points: &'a [GridPoint], base: &MatcherConfig) -> Option<&'a GridPoint> {
    points
        .iter()
        .filter(|p| p.summary.mislinks == 0 && p.summary.ambiguity_failures == 0)
        .max_by(|a, b| {
            a.summary
                .recall
                .partial_cmp(&b.summary.recall)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(
                    // Reversed: nearer to the current defaults wins.
                    distance_from(b, base)
                        .partial_cmp(&distance_from(a, base))
                        .unwrap_or(std::cmp::Ordering::Equal),
                )
        })
}

/// Whether the sweep actually justifies changing anything.
pub fn is_status_quo(point: &GridPoint, base: &MatcherConfig) -> bool {
    distance_from(point, base) < 1e-9
}

pub fn best_f1(points: &[GridPoint]) -> Option<&GridPoint> {
    points.iter().max_by(|a, b| {
        a.summary
            .f1
            .partial_cmp(&b.summary.f1)
            .unwrap_or(std::cmp::Ordering::Equal)
    })
}

pub struct Ablation {
    pub signal: String,
    /// Accuracy lost by removing this signal, with all others still present.
    pub marginal: f64,
    pub recall_delta: f64,
    pub mislink_delta: i64,
    /// Accuracy reached by this signal *alone*.
    pub solo: f64,
}

impl Ablation {
    /// Contributes nothing either way — safe to delete.
    ///
    /// Both measures are required. Marginal alone is not enough: most emails in this corpus
    /// carry several identifiers, so removing `case_number` changes nothing while deleting
    /// it would be catastrophic. A signal is only dead if it neither adds anything to the
    /// ensemble *nor* matches anything by itself.
    pub fn is_dead(&self) -> bool {
        self.marginal.abs() < 0.05 && self.mislink_delta == 0 && self.solo < 0.05
    }

    /// Carries real matches, but every one of them is already covered by another signal.
    pub fn is_redundant(&self) -> bool {
        self.marginal.abs() < 0.05 && self.mislink_delta == 0 && self.solo >= 0.05
    }
}

/// Each signal's contribution, measured two ways.
pub fn run_ablation(
    scored: &[Scored],
    config: &MatcherConfig,
    baseline: &Summary,
) -> Vec<Ablation> {
    let mut present: Vec<String> = scored
        .iter()
        .flat_map(|s| s.contributions.iter().map(|(_, c)| c.name.to_string()))
        .collect();
    present.sort();
    present.dedup();

    present
        .into_iter()
        .map(|signal| {
            let without = score_all(scored, config, Signals::Without(&[signal.as_str()]));
            let alone = score_all(scored, config, Signals::Only(signal.as_str()));
            Ablation {
                marginal: baseline.accuracy_at_1 - without.accuracy_at_1,
                recall_delta: baseline.recall - without.recall,
                mislink_delta: without.mislinks as i64 - baseline.mislinks as i64,
                solo: alone.accuracy_at_1,
                signal,
            }
        })
        .collect()
}

pub fn print_grid(points: &[GridPoint], base: &MatcherConfig) {
    println!("\n--- Sweep ({} grid points) ---", points.len());
    println!(
        "  {:>6} {:>8} {:>7} {:>9} {:>7} {:>7} {:>9}",
        "review", "content", "margin", "accuracy", "recall", "F1", "mislinks"
    );

    // Only the mislink-free frontier is worth reading in full; the rest is noise.
    let mut safe: Vec<&GridPoint> = points.iter().filter(|p| p.summary.mislinks == 0).collect();
    safe.sort_by(|a, b| {
        b.summary
            .recall
            .partial_cmp(&a.summary.recall)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for p in safe.iter().take(12) {
        println!(
            "  {:>6.2} {:>8.2} {:>7.2} {:>8.1}% {:>7.2} {:>7.2} {:>9}",
            p.review_threshold,
            p.content_weight,
            p.ambiguity_margin,
            p.summary.accuracy_at_1,
            p.summary.recall,
            p.summary.f1,
            p.summary.mislinks
        );
    }

    if let Some(f1) = best_f1(points) {
        println!(
            "\n  F1-optimal        review {:.2}, content {:.2}, margin {:.2} → F1 {:.2}, {} mislinks",
            f1.review_threshold,
            f1.content_weight,
            f1.ambiguity_margin,
            f1.summary.f1,
            f1.summary.mislinks
        );
    }
    match best_safe(points, base) {
        Some(p) => {
            println!(
                "  ship (max recall, 0 mislinks)  review {:.2}, content {:.2}, margin {:.2}{}",
                p.review_threshold,
                p.content_weight,
                p.ambiguity_margin,
                if is_status_quo(p, base) {
                    "   ← unchanged: the sweep justifies no change"
                } else {
                    ""
                }
            );
            println!(
                "     accuracy {:.1}%  recall {:.2}  F1 {:.2}   (current defaults: review {:.2}, content {:.2})",
                p.summary.accuracy_at_1,
                p.summary.recall,
                p.summary.f1,
                base.review_threshold,
                base.weights.content,
            );
            println!("\n  by difficulty at the shipping point");
            for (difficulty, stats) in &p.summary.per_difficulty {
                println!(
                    "  {:<14} {:>3}/{:<3} ({:>5.1}%)",
                    difficulty.label(),
                    stats.correct,
                    stats.total,
                    stats.pct()
                );
            }
        }
        None => println!("  no mislink-free operating point exists on this corpus"),
    }
}

pub fn print_ablation(ablations: &[Ablation]) {
    println!("\n--- Ablation ---");
    println!("  marginal = accuracy lost by removing it; solo = accuracy it reaches alone");
    println!(
        "  {:<24} {:>9} {:>7} {:>9} {:>9}",
        "signal", "marginal", "solo", "recall", "mislinks"
    );
    for a in ablations {
        let note = if a.is_dead() {
            "   ← dead, delete it"
        } else if a.is_redundant() {
            "   ← redundant here (covered by another signal)"
        } else {
            ""
        };
        println!(
            "  {:<24} {:>9.1} {:>6.1}% {:>9.3} {:>+9}{}",
            a.signal, a.marginal, a.solo, a.recall_delta, a.mislink_delta, note
        );
    }
    if ablations.iter().any(|a| a.is_redundant()) {
        println!(
            "\n  Redundancy is a property of this corpus, not proof a signal is useless —\n  \
             most fixtures carry several identifiers. Delete only on `dead`."
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::matcher_metrics::DifficultyStats;
    use std::collections::BTreeMap;

    fn summary(recall: f64, f1: f64, mislinks: usize) -> Summary {
        Summary {
            recall,
            f1,
            mislinks,
            ..Summary::default()
        }
    }

    fn point(review: f64, recall: f64, f1: f64, mislinks: usize) -> GridPoint {
        GridPoint {
            review_threshold: review,
            content_weight: 0.7,
            ambiguity_margin: 0.15,
            summary: summary(recall, f1, mislinks),
        }
    }

    /// Defaults, so `point(0.45, …)` sits exactly on them.
    fn base() -> MatcherConfig {
        MatcherConfig::default()
    }

    /// The whole point of the shipping rule: a higher-recall point that mislinks is not a
    /// better point, it is a disqualified one.
    #[test]
    fn shipping_point_never_trades_a_mislink_for_recall() {
        let points = vec![point(0.20, 0.95, 0.97, 3), point(0.45, 0.78, 0.88, 0)];
        let best = best_safe(&points, &base()).unwrap();
        assert_eq!(best.summary.mislinks, 0);
        assert!((best.summary.recall - 0.78).abs() < 1e-9);

        // F1 alone would have chosen the unsafe one — which is why it is reported, not used.
        assert_eq!(best_f1(&points).unwrap().summary.mislinks, 3);
    }

    /// Identical scores are not evidence for changing a shipped constant.
    #[test]
    fn a_tie_on_recall_keeps_the_current_defaults() {
        let points = vec![point(0.25, 0.80, 0.88, 0), point(0.45, 0.80, 0.88, 0)];
        let best = best_safe(&points, &base()).unwrap();
        assert!((best.review_threshold - 0.45).abs() < 1e-9);
        assert!(is_status_quo(best, &base()));
    }

    /// ...but a real recall gain still wins, however far it moves the constants.
    #[test]
    fn a_measured_gain_beats_staying_put() {
        let points = vec![point(0.45, 0.80, 0.88, 0), point(0.20, 0.90, 0.93, 0)];
        let best = best_safe(&points, &base()).unwrap();
        assert!((best.review_threshold - 0.20).abs() < 1e-9);
        assert!(!is_status_quo(best, &base()));
    }

    #[test]
    fn no_safe_point_is_reported_rather_than_guessed() {
        assert!(best_safe(&[point(0.20, 0.9, 0.9, 1)], &base()).is_none());
    }

    #[test]
    fn an_ambiguity_failure_also_disqualifies_a_point() {
        let mut p = point(0.20, 0.99, 0.99, 0);
        p.summary.ambiguity_failures = 1;
        assert!(best_safe(&[p], &base()).is_none());
    }

    #[test]
    fn a_dead_signal_is_distinguished_from_a_merely_redundant_one() {
        let redundant = Ablation {
            signal: String::from("case_number"),
            marginal: 0.0,
            recall_delta: 0.0,
            mislink_delta: 0,
            solo: 20.0,
        };
        let dead = Ablation {
            signal: redundant.signal.clone(),
            solo: 0.0,
            ..redundant
        };
        assert!(redundant.is_redundant() && !redundant.is_dead());
        assert!(dead.is_dead() && !dead.is_redundant());
    }

    #[test]
    fn grid_point_config_overrides_only_the_swept_fields() {
        let base = MatcherConfig::default();
        let config = point(0.30, 0.0, 0.0, 0).config_from(&base);
        assert!((config.review_threshold - 0.30).abs() < 1e-9);
        assert!((config.weights.content - 0.7).abs() < 1e-9);
        assert_eq!(config.auto_link_threshold, base.auto_link_threshold);
        assert_eq!(config.weights.case_number, base.weights.case_number);
    }

    #[test]
    fn per_difficulty_survives_into_the_summary_default() {
        let s = Summary {
            per_difficulty: BTreeMap::new(),
            ..Summary::default()
        };
        assert!(s.per_difficulty.is_empty());
        assert_eq!(DifficultyStats::default().total, 0);
    }
}
