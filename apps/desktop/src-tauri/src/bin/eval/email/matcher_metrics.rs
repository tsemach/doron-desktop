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
    pub per_difficulty: BTreeMap<Difficulty, DifficultyStats>,
    pub per_practice: BTreeMap<&'static str, DifficultyStats>,
    pub per_signal: BTreeMap<String, usize>,
    pub failures: Vec<String>,
}

pub fn summarize(fixtures: &[EmailFixture], predictions: &[Prediction]) -> Summary {
    let total = predictions.len();
    let mut correct = 0;
    let mut mislinks = 0;
    let mut ambiguity_failures = 0;
    let mut false_positives = 0;
    let mut missed = 0;
    let mut auto_links = 0;
    let mut reciprocal_sum = 0.0;
    let mut per_difficulty: BTreeMap<Difficulty, DifficultyStats> = BTreeMap::new();
    let mut per_practice: BTreeMap<&'static str, DifficultyStats> = BTreeMap::new();
    let mut per_signal: BTreeMap<String, usize> = BTreeMap::new();
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

        if p.correct() {
            for s in &p.signals {
                *per_signal.entry(s.clone()).or_insert(0) += 1;
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
        per_difficulty,
        per_practice,
        per_signal,
        failures,
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
        println!("\nby signal (correct matches)");
        for (signal, n) in &summary.per_signal {
            println!("  {signal:<24} {n:>4}");
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

    #[test]
    fn mislinks_are_listed_in_failures() {
        let s = summarize(&[], &[pred("e", Some(1), Some(2), Difficulty::Easy)]);
        assert_eq!(s.mislinks, 1);
        assert!(s.failures[0].contains("MISLINK"));
    }
}
