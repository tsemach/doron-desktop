//! Metrics for the matcher eval.
//!
//! **Mislink rate is the gate**, not F1: auto-linking an email to the wrong matter is the
//! one failure a user cannot easily undo, so it is reported separately and any occurrence
//! fails the run. Everything else is diagnostic.

use std::collections::BTreeMap;

use tauri_app_lib::email::case_matcher::MatchBand;

use super::corpus::{Difficulty, EmailFixture, Practice};

pub struct Prediction {
    pub fixture_id: String,
    pub expected_case: Option<i64>,
    /// Adversarial fixtures only: the second case that legitimately competes for this
    /// email. Linking to *either* is ambiguity, not error.
    pub competing_case: Option<i64>,
    pub predicted_case: Option<i64>,
    /// The top-ranked case before the band decided whether to surface it. Diagnostic only:
    /// it makes the cost of the review threshold visible instead of silently absorbed.
    pub top_case: Option<i64>,
    pub confidence: f64,
    pub band: MatchBand,
    pub rank_of_expected: Option<usize>,
    pub difficulty: Difficulty,
    pub practice: Option<Practice>,
    pub signals: Vec<String>,
    pub explanation: String,
}

impl Prediction {
    /// Cases it is legitimate to surface for this email.
    ///
    /// For an adversarial fixture the expected id is one of a competing *pair*, chosen
    /// arbitrarily by the generator. Requiring that exact id would score identical
    /// behaviour as correct or as a mislink depending on a coin flip — and would fail the
    /// gate for something the design actually wants (ambiguity → Review).
    fn acceptable(&self) -> Vec<i64> {
        self.expected_case
            .into_iter()
            .chain(self.competing_case)
            .collect()
    }

    fn is_adversarial(&self) -> bool {
        self.competing_case.is_some()
    }

    fn correct(&self) -> bool {
        match (self.expected_case, self.predicted_case) {
            (Some(_), Some(predicted)) if self.is_adversarial() => {
                // Success is *recognising the ambiguity*: surface one of the pair without
                // linking automatically. Confidently picking one is a failure, not a win.
                self.acceptable().contains(&predicted) && self.band != MatchBand::AutoLink
            }
            (Some(want), Some(predicted)) => predicted == want,
            _ => false,
        }
    }

    /// Linked to a case that is not a legitimate candidate. The metric that gates the phase.
    fn mislinked(&self) -> bool {
        match self.predicted_case {
            Some(predicted) if self.expected_case.is_some() => {
                !self.acceptable().contains(&predicted)
            }
            _ => false,
        }
    }

    /// An ambiguous email that was linked automatically anyway — the ambiguity guard
    /// failing to do its job. Gated alongside mislinks.
    fn ambiguity_failure(&self) -> bool {
        self.is_adversarial()
            && self.predicted_case.is_some()
            && self.band == MatchBand::AutoLink
    }
    /// Surfaced a case for an email that belongs to none.
    fn false_positive(&self) -> bool {
        self.expected_case.is_none() && self.predicted_case.is_some()
    }
    fn missed(&self) -> bool {
        self.expected_case.is_some() && self.predicted_case.is_none()
    }

    /// Ranked a case first but stayed below the review threshold.
    fn suppressed(&self) -> bool {
        self.predicted_case.is_none() && self.top_case.is_some()
    }

    /// A suppression that cost a right answer — what raising recall would buy.
    fn suppressed_right(&self) -> bool {
        self.suppressed() && self.top_case.is_some() && self.top_case == self.expected_case
    }

}

#[derive(Default, Clone, Copy)]
pub struct DifficultyStats {
    pub total: usize,
    pub correct: usize,
}

impl DifficultyStats {
    pub fn pct(&self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            self.correct as f64 / self.total as f64 * 100.0
        }
    }
}

pub struct Summary {
    pub total: usize,
    pub accuracy_at_1: f64,
    pub precision: f64,
    pub recall: f64,
    pub f1: f64,
    pub mrr: f64,
    pub mislinks: usize,
    pub ambiguity_failures: usize,
    pub false_positives: usize,
    pub missed: usize,
    pub auto_links: usize,
    pub suppressed_right: usize,
    pub suppressed_wrong: usize,
    pub per_difficulty: BTreeMap<Difficulty, DifficultyStats>,
    pub per_practice: BTreeMap<&'static str, DifficultyStats>,
    /// Per signal, how many links it supported and how many of those were right. Counting
    /// only the correct ones (as this did) cannot distinguish a signal that is always right
    /// from one that fires constantly and is right a third of the time — which is exactly
    /// the question P6's ablation has to answer.
    pub per_signal: BTreeMap<String, DifficultyStats>,
    pub failures: Vec<String>,
    /// `(confidence, was_right)` for every candidate the band declined, so a threshold
    /// sweep can ask whether the two populations are separable at all.
    pub suppressed_scores: Vec<(f64, bool)>,
}

pub fn summarize(fixtures: &[EmailFixture], predictions: &[Prediction]) -> Summary {
    let total = predictions.len();
    let mut correct = 0;
    let mut mislinks = 0;
    let mut ambiguity_failures = 0;
    let mut false_positives = 0;
    let mut missed = 0;
    let mut auto_links = 0;
    let mut suppressed_right = 0;
    let mut suppressed_wrong = 0;
    let mut suppressed_scores: Vec<(f64, bool)> = Vec::new();
    let mut reciprocal_sum = 0.0;
    let mut per_difficulty: BTreeMap<Difficulty, DifficultyStats> = BTreeMap::new();
    let mut per_practice: BTreeMap<&'static str, DifficultyStats> = BTreeMap::new();
    let mut per_signal: BTreeMap<String, DifficultyStats> = BTreeMap::new();
    let mut failures = Vec::new();

    for p in predictions {
        let entry = per_difficulty.entry(p.difficulty).or_default();
        entry.total += 1;

        // `unrelated` and `decoy` are correct precisely when nothing was linked.
        let ok = if p.expected_case.is_none() {
            p.predicted_case.is_none()
        } else {
            p.correct()
        };
        if ok {
            entry.correct += 1;
            if p.expected_case.is_some() {
                correct += 1;
            }
        }

        if let Some(practice) = p.practice {
            let e = per_practice.entry(practice.label()).or_default();
            e.total += 1;
            if ok {
                e.correct += 1;
            }
        }

        // Only signals that actually supported a surfaced link are counted; a contribution
        // the band discarded influenced nothing.
        if p.predicted_case.is_some() {
            let right = p.correct();
            for s in &p.signals {
                let e = per_signal.entry(s.clone()).or_default();
                e.total += 1;
                if right {
                    e.correct += 1;
                }
            }
        }
        if let Some(rank) = p.rank_of_expected {
            reciprocal_sum += 1.0 / (rank as f64 + 1.0);
        }
        if p.band == MatchBand::AutoLink {
            auto_links += 1;
        }
        if p.mislinked() {
            mislinks += 1;
            failures.push(format!(
                "[{}] MISLINK: expected case {:?}, linked {:?} ({:.2}) — {}",
                p.fixture_id, p.expected_case, p.predicted_case, p.confidence, p.explanation
            ));
        }
        if p.false_positive() {
            false_positives += 1;
            failures.push(format!(
                "[{}] FALSE POSITIVE ({}): linked {:?} at {:.2}",
                p.fixture_id,
                p.difficulty.label(),
                p.predicted_case,
                p.confidence
            ));
        }
        if p.ambiguity_failure() {
            ambiguity_failures += 1;
            failures.push(format!(
                "[{}] AMBIGUITY: auto-linked case {:?} despite a competing case {:?}",
                p.fixture_id, p.predicted_case, p.competing_case
            ));
        }
        if p.missed() {
            missed += 1;
        }
        if p.suppressed() {
            let right = p.suppressed_right();
            if right {
                suppressed_right += 1;
            } else {
                suppressed_wrong += 1;
            }
            suppressed_scores.push((p.confidence, right));
        }
    }

    let linkable = fixtures
        .iter()
        .filter(|f| f.expected.case_id.is_some())
        .count();
    let predicted_any = predictions
        .iter()
        .filter(|p| p.predicted_case.is_some())
        .count();

    let precision = if predicted_any == 0 {
        1.0
    } else {
        correct as f64 / predicted_any as f64
    };
    let recall = if linkable == 0 {
        1.0
    } else {
        correct as f64 / linkable as f64
    };
    let f1 = if precision + recall == 0.0 {
        0.0
    } else {
        2.0 * precision * recall / (precision + recall)
    };

    Summary {
        total,
        accuracy_at_1: if linkable == 0 {
            0.0
        } else {
            correct as f64 / linkable as f64 * 100.0
        },
        precision,
        recall,
        f1,
        mrr: if linkable == 0 {
            0.0
        } else {
            reciprocal_sum / linkable as f64
        },
        mislinks,
        ambiguity_failures,
        false_positives,
        missed,
        auto_links,
        suppressed_right,
        suppressed_wrong,
        per_difficulty,
        per_practice,
        per_signal,
        failures,
        suppressed_scores,
    }
}

/// What each candidate review threshold would admit, over the suppressed population.
///
/// Answers the only question that matters when a tier ranks well but scores low: is there
/// a threshold that lets the right answers through without the wrong ones? If every row
/// gains and loses in step, the fix is the scoring, not the threshold.
pub fn print_threshold_sweep(summary: &Summary, current: f64) {
    if summary.suppressed_scores.is_empty() {
        return;
    }
    println!("\nsuppressed population by threshold (current {current:.2})");
    println!("  {:>9}  {:>7}  {:>7}", "threshold", "right", "wrong");
    let mut t = 0.40;
    while t > 0.049 {
        let right = summary
            .suppressed_scores
            .iter()
            .filter(|(c, ok)| *ok && *c >= t)
            .count();
        let wrong = summary
            .suppressed_scores
            .iter()
            .filter(|(c, ok)| !*ok && *c >= t)
            .count();
        println!("  {t:>9.2}  {right:>7}  {wrong:>7}");
        t -= 0.05;
    }
}

pub fn print_report(summary: &Summary, case_count: usize) {
    println!(
        "\n--- Matcher results ({} emails, {} cases) ---",
        summary.total, case_count
    );
    println!("accuracy@1        {:.1}%", summary.accuracy_at_1);
    println!(
        "precision         {:.2}   recall {:.2}   F1 {:.2}",
        summary.precision, summary.recall, summary.f1
    );
    println!("MRR               {:.2}", summary.mrr);
    println!(
        "mislink rate      {:.1}%   ({} mislinked)   ← gate",
        if summary.total == 0 {
            0.0
        } else {
            summary.mislinks as f64 / summary.total as f64 * 100.0
        },
        summary.mislinks
    );
    println!(
        "ambiguity fails   {}   ← auto-linked despite a competing case",
        summary.ambiguity_failures
    );
    println!("false positives   {}", summary.false_positives);
    println!("missed            {}", summary.missed);
    println!("auto-linked       {}", summary.auto_links);
    println!(
        "below threshold   {} suppressed ({} would have been right, {} wrong)",
        summary.suppressed_right + summary.suppressed_wrong,
        summary.suppressed_right,
        summary.suppressed_wrong
    );

    println!("\nby difficulty");
    for (difficulty, stats) in &summary.per_difficulty {
        println!(
            "  {:<12} {:>3}/{:<3} ({:>5.1}%)",
            difficulty.label(),
            stats.correct,
            stats.total,
            stats.pct()
        );
    }

    if !summary.per_practice.is_empty() {
        println!("\nby practice");
        for (practice, stats) in &summary.per_practice {
            println!(
                "  {:<14} {:>3}/{:<3} ({:>5.1}%)",
                practice,
                stats.correct,
                stats.total,
                stats.pct()
            );
        }
    }

    if !summary.per_signal.is_empty() {
        println!("\nby signal (correct / links supported)");
        for (signal, stats) in &summary.per_signal {
            println!(
                "  {:<24} {:>4}/{:<4} ({:>5.1}%)",
                signal,
                stats.correct,
                stats.total,
                stats.pct()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pred(
        id: &str,
        expected: Option<i64>,
        predicted: Option<i64>,
        difficulty: Difficulty,
    ) -> Prediction {
        Prediction {
            fixture_id: id.into(),
            expected_case: expected,
            competing_case: None,
            predicted_case: predicted,
            top_case: predicted,
            confidence: 0.9,
            band: MatchBand::Review,
            rank_of_expected: if expected.is_some() && expected == predicted {
                Some(0)
            } else {
                None
            },
            difficulty,
            practice: None,
            signals: vec!["case_number".into()],
            explanation: String::new(),
        }
    }

    #[test]
    fn counts_a_wrong_link_as_a_mislink() {
        let p = pred("a", Some(1), Some(2), Difficulty::Easy);
        assert!(p.mislinked());
        assert!(!p.false_positive());
        assert!(!p.correct());
    }

    #[test]
    fn linking_an_unrelated_email_is_a_false_positive_not_a_mislink() {
        let p = pred("b", None, Some(3), Difficulty::Decoy);
        assert!(p.false_positive());
        assert!(!p.mislinked());
    }

    #[test]
    fn declining_an_unrelated_email_counts_as_correct() {
        let s = summarize(&[], &[pred("c", None, None, Difficulty::Unrelated)]);
        assert_eq!(s.per_difficulty[&Difficulty::Unrelated].correct, 1);
        assert_eq!(s.mislinks, 0);
        assert_eq!(s.false_positives, 0);
    }

    #[test]
    fn missing_a_linkable_email_is_recorded_but_is_not_a_mislink() {
        let p = pred("d", Some(1), None, Difficulty::Hard);
        assert!(p.missed());
        assert!(!p.mislinked());
    }

    fn adversarial(predicted: Option<i64>, band: MatchBand) -> Prediction {
        Prediction {
            competing_case: Some(2),
            band,
            ..pred("adv", Some(1), predicted, Difficulty::Adversarial)
        }
    }

    /// Either case of the competing pair is a legitimate surface, so which one the
    /// generator happened to record must not decide correct-vs-mislink.
    #[test]
    fn adversarial_accepts_either_competing_case() {
        assert!(adversarial(Some(1), MatchBand::Review).correct());
        assert!(adversarial(Some(2), MatchBand::Review).correct());
        assert!(!adversarial(Some(1), MatchBand::Review).mislinked());
        assert!(!adversarial(Some(2), MatchBand::Review).mislinked());
    }

    #[test]
    fn adversarial_auto_link_is_a_failure_not_a_win() {
        let p = adversarial(Some(1), MatchBand::AutoLink);
        assert!(!p.correct(), "linking confidently defeats the ambiguity guard");
        assert!(p.ambiguity_failure());
    }

    #[test]
    fn adversarial_linking_a_third_case_is_still_a_mislink() {
        let p = adversarial(Some(99), MatchBand::Review);
        assert!(p.mislinked());
        assert!(!p.correct());
    }

    #[test]
    fn adversarial_no_match_is_a_miss_not_a_pass() {
        let p = adversarial(None, MatchBand::Ignore);
        assert!(!p.correct(), "finding nothing is not the same as recognising ambiguity");
        assert!(p.missed());
        assert!(!p.mislinked());
    }

    /// A candidate the band declined to surface is not a link, and must not be scored as
    /// one — but the run still has to say out loud what the threshold cost.
    #[test]
    fn a_suppressed_candidate_is_reported_but_not_scored_as_a_link() {
        let saved = Prediction {
            top_case: Some(7),
            band: MatchBand::Ignore,
            ..pred("f", None, None, Difficulty::Decoy)
        };
        let lost = Prediction {
            top_case: Some(1),
            band: MatchBand::Ignore,
            ..pred("g", Some(1), None, Difficulty::Hard)
        };
        let s = summarize(&[], &[saved, lost]);

        assert_eq!(s.mislinks, 0);
        assert_eq!(s.false_positives, 0);
        assert_eq!(
            s.suppressed_wrong, 1,
            "declining the decoy is what the gate buys"
        );
        assert_eq!(s.suppressed_right, 1, "and this is what it costs");
        assert_eq!(s.missed, 1);
    }

    #[test]
    fn mislinks_are_listed_in_failures() {
        let s = summarize(&[], &[pred("e", Some(1), Some(2), Difficulty::Easy)]);
        assert_eq!(s.mislinks, 1);
        assert!(s.failures[0].contains("MISLINK"));
    }
}
