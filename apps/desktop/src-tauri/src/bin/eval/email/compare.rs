//! `eval email compare <run_a> <run_b>` — phase-over-phase deltas.

use clap::Args;

use super::history_compare::{load, practices, slices};

#[derive(Args, Debug, Clone)]
pub struct CompareArgs {
    /// Baseline run id (see `eval email list`)
    pub run_a: i64,
    /// Run to compare against the baseline
    pub run_b: i64,
}

fn arrow(delta: f64) -> &'static str {
    if delta > 0.05 {
        "+"
    } else if delta < -0.05 {
        "-"
    } else {
        " "
    }
}

/// A slice one run never measured prints as `—`, not 0% — otherwise adding a difficulty
/// in a later phase would read as a total regression of the earlier one.
fn print_slices(
    names: &[String],
    before: impl Fn(&str) -> Option<f64>,
    after: impl Fn(&str) -> Option<f64>,
) {
    for name in names {
        match (before(name), after(name)) {
            (Some(x), Some(y)) => println!(
                "  {:<14} {:>6.1}% → {:>6.1}%   {}{:.1}",
                name,
                x,
                y,
                arrow(y - x),
                (y - x).abs()
            ),
            (None, Some(y)) => println!("  {name:<14} {:>7} → {y:>6.1}%   new", "—"),
            (Some(x), None) => println!("  {name:<14} {x:>6.1}% → {:>7}   dropped", "—"),
            (None, None) => {}
        }
    }
}

pub async fn execute(args: CompareArgs) -> Result<(), String> {
    let a = load(args.run_a)?;
    let b = load(args.run_b)?;

    println!(
        "\nCompare  run {} ({}) → run {} ({})\n",
        a.id, a.label, b.id, b.label
    );

    let acc = b.accuracy_at_1 - a.accuracy_at_1;
    println!(
        "  {:<14} {:>6.1}% → {:>6.1}%   {}{:.1}",
        "accuracy@1",
        a.accuracy_at_1,
        b.accuracy_at_1,
        arrow(acc),
        acc.abs()
    );
    let f1 = b.f1 - a.f1;
    println!(
        "  {:<14} {:>7.2} → {:>7.2}   {}{:.2}",
        "F1",
        a.f1,
        b.f1,
        arrow(f1),
        f1.abs()
    );
    println!(
        "  {:<14} {:>7} → {:>7}   {}   ← must stay 0",
        "mislinks",
        a.mislinks,
        b.mislinks,
        arrow((b.mislinks - a.mislinks) as f64)
    );
    println!(
        "  {:<14} {:>7} → {:>7}   {}",
        "false pos",
        a.false_positives,
        b.false_positives,
        arrow((b.false_positives - a.false_positives) as f64)
    );
    println!(
        "  {:<14} {:>7} → {:>7}   {}",
        "missed",
        a.missed,
        b.missed,
        arrow((b.missed - a.missed) as f64)
    );

    println!("\n  by difficulty");
    print_slices(&slices(&a, &b), |s| a.pct(s), |s| b.pct(s));

    println!("\n  by practice");
    print_slices(
        &practices(&a, &b),
        |s| a.practice_pct(s),
        |s| b.practice_pct(s),
    );

    if b.mislinks > a.mislinks {
        println!("\n  ⚠ mislinks increased — the one failure a user cannot undo.");
    }
    Ok(())
}
