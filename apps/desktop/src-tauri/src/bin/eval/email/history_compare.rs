//! Loading two recorded runs side by side, for `eval email compare`.
//!
//! Per-difficulty deltas are the point. An aggregate accuracy gain routinely hides a
//! regression in one slice — Tier B lifting `hard` while quietly linking decoys is the
//! exact shape of that failure, and the headline number would look like progress.

use rusqlite::params;

use super::history;

pub struct RunDetail {
    pub id: i64,
    pub label: String,
    pub accuracy_at_1: f64,
    pub f1: f64,
    pub mislinks: i64,
    pub false_positives: i64,
    pub missed: i64,
    /// `(slice, correct, total)` in the order the run recorded them.
    pub per_difficulty: Vec<(String, usize, usize)>,
    pub per_practice: Vec<(String, usize, usize)>,
}

fn lookup(rows: &[(String, usize, usize)], slice: &str) -> Option<f64> {
    rows.iter()
        .find(|(name, _, _)| name == slice)
        .map(|(_, correct, total)| {
            if *total == 0 {
                0.0
            } else {
                *correct as f64 / *total as f64 * 100.0
            }
        })
}

fn union(a: &[(String, usize, usize)], b: &[(String, usize, usize)]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (name, _, _) in a.iter().chain(b.iter()) {
        if !out.iter().any(|s| s == name) {
            out.push(name.clone());
        }
    }
    out
}

impl RunDetail {
    pub fn pct(&self, slice: &str) -> Option<f64> {
        lookup(&self.per_difficulty, slice)
    }

    pub fn practice_pct(&self, slice: &str) -> Option<f64> {
        lookup(&self.per_practice, slice)
    }
}

pub fn load(id: i64) -> Result<RunDetail, String> {
    let conn = history::open()?;
    conn.query_row(
        "SELECT id, label, accuracy_at_1, f1, mislinks, false_positives, missed,
                per_difficulty_json, per_practice_json
         FROM email_matcher_runs WHERE id = ?1",
        params![id],
        |r| {
            let per_difficulty: String = r.get(7)?;
            let per_practice: String = r.get(8)?;
            Ok(RunDetail {
                id: r.get(0)?,
                label: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                accuracy_at_1: r.get(2)?,
                f1: r.get(3)?,
                mislinks: r.get(4)?,
                false_positives: r.get(5)?,
                missed: r.get(6)?,
                per_difficulty: serde_json::from_str(&per_difficulty).unwrap_or_default(),
                per_practice: serde_json::from_str(&per_practice).unwrap_or_default(),
            })
        },
    )
    .map_err(|e| format!("Run {id} not found: {e}"))
}

/// Every difficulty present in either run, in first-seen order so output is stable.
pub fn slices(a: &RunDetail, b: &RunDetail) -> Vec<String> {
    union(&a.per_difficulty, &b.per_difficulty)
}

pub fn practices(a: &RunDetail, b: &RunDetail) -> Vec<String> {
    union(&a.per_practice, &b.per_practice)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detail(slices: &[(&str, usize, usize)]) -> RunDetail {
        RunDetail {
            id: 1,
            label: "x".into(),
            accuracy_at_1: 0.0,
            f1: 0.0,
            mislinks: 0,
            false_positives: 0,
            missed: 0,
            per_difficulty: slices
                .iter()
                .map(|(n, c, t)| (n.to_string(), *c, *t))
                .collect(),
            per_practice: vec![],
        }
    }

    #[test]
    fn percentage_is_per_slice() {
        let d = detail(&[("hard", 22, 33)]);
        assert!((d.pct("hard").unwrap() - 66.666).abs() < 0.01);
        assert_eq!(d.pct("missing"), None);
    }

    #[test]
    fn an_empty_slice_does_not_divide_by_zero() {
        assert_eq!(detail(&[("hard", 0, 0)]).pct("hard"), Some(0.0));
    }

    /// A slice only the newer run measures must still appear, or a newly added
    /// difficulty would silently drop out of the comparison.
    #[test]
    fn slices_union_both_runs_in_stable_order() {
        let a = detail(&[("easy", 1, 1), ("hard", 1, 1)]);
        let b = detail(&[("hard", 1, 1), ("decoy", 1, 1)]);
        assert_eq!(slices(&a, &b), vec!["easy", "hard", "decoy"]);
    }
}
