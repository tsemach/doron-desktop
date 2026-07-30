//! `eval email examples` — a worked tour of the email eval commands.
//!
//! Kept in sync with the subcommands by a test below: anything reachable from
//! `EmailCommands` has to appear here, so this cannot quietly rot the way it did between
//! P1 and P6 (it still described `generate` as copying a fixture file long after it began
//! synthesising corpora).

use clap::Args;

#[derive(Args, Debug, Clone)]
pub struct ExamplesArgs {}

const EVAL: &str = "cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml email";

fn section(title: &str) {
    println!("\n\x1b[1m{title}\x1b[0m");
}

fn example(comment: &str, command: &str) {
    println!("\n  # {comment}");
    println!("  {EVAL} {command}");
}

pub async fn execute(_args: ExamplesArgs) -> Result<(), String> {
    println!("Email evaluation — the deterministic case matcher (no LLM).");
    println!("Full design: docs/emails/case_matcher_design.md");

    section("1. Build a corpus");
    example(
        "Synthesise 30 cases and 200 labelled emails. Same seed = same bytes.",
        "generate --corpus-dir ./email_eval_corpus --with-attachments",
    );
    example(
        "Bigger, Hebrew only, conveyancing-heavy, different seed",
        "generate --corpus-dir ./email_eval_corpus --cases 60 --emails 500 --lang he \\\n      --practice-mix 30/70 --seed 7 --with-attachments",
    );
    example(
        "More non-case mail, mostly business-like decoys rather than obvious spam.\n  # Decoys are what actually measure the false-positive rate: plain spam is\n  # filtered before the matcher ever sees it.",
        "generate --corpus-dir ./email_eval_corpus --unrelated-ratio 0.4 --decoy-share 0.8",
    );
    example(
        "Check composition and integrity of what you just generated",
        "corpus-stats --corpus-dir ./email_eval_corpus",
    );

    section("2. Run the matcher");
    example(
        "The main command. Exits non-zero if any email is mislinked, so it works as a CI gate.",
        "run --corpus-dir ./email_eval_corpus --mode matcher --label my-run",
    );
    example(
        "List every failure, plus a threshold sweep over the suppressed candidates",
        "run --corpus-dir ./email_eval_corpus --mode matcher --verbose",
    );
    example(
        "Skip rebuilding the scratch index — fast, but stale if the corpus changed",
        "run --corpus-dir ./email_eval_corpus --mode matcher --reuse",
    );

    section("3. Tune (these skip the normal run and record nothing)");
    example(
        "Grid-search review threshold x content weight x ambiguity margin.\n  # Reports the F1-optimal point and the highest-recall mislink-free one — ship the latter.\n  # --apply prints the config.rs change; it never writes to it.",
        "run --corpus-dir ./email_eval_corpus --sweep --apply",
    );
    example(
        "Each signal's marginal contribution (drop it) and solo power (use only it).\n  # Both matter: a signal can be redundant on this corpus yet still carry real matches.",
        "run --corpus-dir ./email_eval_corpus --ablate",
    );
    example(
        "Day-one accuracy: score without the signals that only exist once a user has\n  # confirmed an email (thread_ref, sender_confirmed)",
        "run --corpus-dir ./email_eval_corpus --cold-start",
    );
    example("All three in one collection pass", "run --corpus-dir ./email_eval_corpus --sweep --ablate --cold-start");

    section("4. Run against REAL mail (the check the corpus cannot make)");
    println!("\n  Reads the account already configured in the app. Never marks anything read:");
    println!("  the mailbox is opened with EXAMINE and bodies fetched with BODY.PEEK.");
    println!("\n  python3 apps/desktop/src-tauri/scripts/gmail_export.py \\");
    println!("      --out ./real_emails.json --days 30 --with-attachments");
    example(
        "Match that mail against a copy of your profile (--in-place to use the live one)",
        "real --emails ./real_emails.json",
    );

    section("5. Diagnose a bad score");
    println!("\n  Run these before debugging the scoring — a bad number is usually an empty");
    println!("  index or a missed extraction, not the matcher.");
    example(
        "Are the identifier / case-text / document indexes actually populated?",
        "index --corpus-dir ./email_eval_corpus",
    );
    example(
        "Is signal extraction finding the identifiers, including inside attachments?",
        "signals --corpus-dir ./email_eval_corpus --verbose",
    );

    section("6. Compare runs over time");
    example("Recorded runs, newest first", "list");
    example("Everything about one run, including the config it used", "show 11");
    example(
        "Per-difficulty and per-practice deltas — an aggregate gain can hide a slice regression",
        "compare 11 12",
    );

    section("7. Legacy LLM classification eval (--mode classification)");
    println!("\n  Separate from the matcher: scores the LLM's review/search_terms output.");
    println!("  The shipping pipeline does not call an LLM at all.");
    example(
        "No LLM; uses classifications injected into the fixtures (CI)",
        "run --mode classification --inject-only --corpus-dir tests/email/fixtures",
    );
    example(
        "Against the local sidecar (start the app, or llama-server on :10086)",
        "run --mode classification --provider local \\\n      --model \"Phi-4-mini-instruct (3.8B Q4)\" --corpus-dir ./email_eval_corpus",
    );

    section("Reading the report");
    println!(
        "
  accuracy@1        of linkable emails, how many got the right case
  precision/recall  of what we linked / of what was findable
  mislink rate      wrong case on a real email — THE GATE, fails the run
  false positives   linked an email that belongs to no case
  missed            found nothing for an email that had a case
  below threshold   candidates the band declined, split into right and wrong
"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    /// The printed examples only — everything above `#[cfg(test)]`.
    ///
    /// Without this the assertions below would match the command names listed in their own
    /// arrays and pass no matter what the examples actually say.
    fn printed_examples() -> &'static str {
        include_str!("examples.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("source always has a first segment")
    }

    /// Every subcommand must appear in the examples. This file drifted badly once already;
    /// the test is what stops it happening again silently.
    #[test]
    fn every_subcommand_is_demonstrated() {
        let source = printed_examples();
        // Mirrors `EmailCommands`, minus `examples` itself.
        for command in [
            "generate",
            "corpus-stats",
            "index",
            "signals",
            "run",
            "list",
            "show",
            "compare",
            "real",
        ] {
            assert!(
                source.contains(&format!("\"{command} ")) || source.contains(&format!("\"{command}\"")),
                "subcommand '{command}' is not shown in `eval email examples`"
            );
        }
    }

    /// Likewise for the flags added in P6 — the ones a reader is least likely to guess.
    #[test]
    fn the_tuning_flags_are_demonstrated() {
        let source = printed_examples();
        for flag in ["--sweep", "--ablate", "--cold-start", "--apply", "--verbose"] {
            assert!(source.contains(flag), "flag '{flag}' is not shown in examples");
        }
    }
}
