//! `eval email index` — build the matcher indexes from a corpus and report their health.
//!
//! This is P2's verification: it answers "did identifier mining actually find the
//! identifiers these cases carry", per practice area, before any matcher exists to be
//! measured. A case with no decisive identifier can never be matched by Tier A, so that
//! count is the number to watch.

use clap::Args;
use rusqlite::Connection;
use std::collections::BTreeMap;

use super::corpus::CorpusCase;
use super::harness::{build_profile, BuildOptions};

#[derive(Args, Debug, Clone)]
pub struct IndexArgs {
    /// Corpus directory produced by `eval email generate`
    #[arg(long, default_value = "./email_eval_corpus")]
    pub corpus_dir: String,

    /// Reuse an existing scratch database instead of rebuilding it
    #[arg(long)]
    pub reuse: bool,
}

/// Identifier kinds that can decide a match on their own (design §5.5 A1–A5).
const DECISIVE_KINDS: [&str; 5] = [
    "case_number",
    "land_registry",
    "deed",
    "national_id",
    "company_id",
];

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
}

fn identifier_counts(conn: &Connection) -> BTreeMap<String, (i64, i64)> {
    let mut out = BTreeMap::new();
    let mut stmt = match conn.prepare(
        "SELECT kind, COUNT(*), COUNT(DISTINCT case_id) FROM case_identifiers GROUP BY kind",
    ) {
        Ok(s) => s,
        Err(_) => return out,
    };
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, i64>(2)?,
        ))
    });
    if let Ok(rows) = rows {
        for (kind, total, cases) in rows.flatten() {
            out.insert(kind, (total, cases));
        }
    }
    out
}

fn cases_without_decisive_identifier(conn: &Connection, cases: &[CorpusCase]) -> Vec<i64> {
    let placeholders = DECISIVE_KINDS
        .iter()
        .map(|k| format!("'{k}'"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT COUNT(*) FROM case_identifiers WHERE case_id = ?1 AND kind IN ({placeholders})"
    );
    cases
        .iter()
        .filter(|c| {
            conn.query_row(&sql, rusqlite::params![c.id], |r| r.get::<_, i64>(0))
                .unwrap_or(0)
                == 0
        })
        .map(|c| c.id)
        .collect()
}

fn pct(n: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        n as f64 / total as f64 * 100.0
    }
}

pub async fn execute(args: IndexArgs) -> Result<(), String> {
    println!("Building index profile from {} ...", args.corpus_dir);
    let (profile, indexed) = build_profile(
        &args.corpus_dir,
        BuildOptions {
            fresh: !args.reuse,
        },
    )
    .await?;

    let conn = &profile.conn;
    let case_total = profile.cases.len();

    let docs = count(conn, "SELECT COUNT(*) FROM documents");
    let fts_docs = count(conn, "SELECT COUNT(*) FROM documents_fts");
    let assigned = count(conn, "SELECT COUNT(*) FROM documents WHERE case_id IS NOT NULL");
    let case_fts = count(conn, "SELECT COUNT(*) FROM case_text_fts");
    let identifiers = count(conn, "SELECT COUNT(*) FROM case_identifiers");

    println!("\nProfile: {}", profile.db_path.display());
    println!("  Cases:              {case_total}");
    println!("  Documents indexed:  {docs}   (docs FTS rows: {fts_docs}, from {indexed} files)");
    println!(
        "  documents.case_id:  {assigned}   ({:.1}% of documents assigned)",
        pct(assigned as usize, docs as usize)
    );
    println!("  case_text_fts:      {case_fts}");
    println!("  case_identifiers:   {identifiers}");

    for (kind, (total, cases)) in identifier_counts(conn) {
        println!(
            "    {kind:<14} {total:>4}   ({:.0}% of cases have ≥1)",
            pct(cases as usize, case_total)
        );
    }

    // Per practice area — an aggregate that looks healthy can hide one area at zero,
    // which is exactly the failure the P0 audit found.
    println!("\nDecisive identifier coverage by practice");
    for conveyancing in [false, true] {
        let subset: Vec<&CorpusCase> = profile
            .cases
            .iter()
            .filter(|c| c.practice.is_conveyancing() == conveyancing)
            .collect();
        if subset.is_empty() {
            continue;
        }
        let owned: Vec<CorpusCase> = subset.iter().map(|c| (*c).clone()).collect();
        let missing = cases_without_decisive_identifier(conn, &owned);
        let covered = subset.len() - missing.len();
        println!(
            "  {:<14} {covered}/{}  ({:.0}%)",
            if conveyancing {
                "conveyancing"
            } else {
                "litigation"
            },
            subset.len(),
            pct(covered, subset.len())
        );
    }

    let missing = cases_without_decisive_identifier(conn, &profile.cases);
    println!(
        "\nCases with NO decisive identifier: {}   ← Tier A can never match these",
        missing.len()
    );
    if !missing.is_empty() {
        println!("  case ids: {missing:?}");
    }

    // P2 exit criteria, enforced rather than eyeballed.
    let mut problems = Vec::new();
    let covered = case_total - missing.len();
    if pct(covered, case_total) < 90.0 {
        problems.push(format!(
            "only {:.0}% of cases have a decisive identifier (need ≥90%) — field-name mining is failing",
            pct(covered, case_total)
        ));
    }
    let expected_docs: usize = profile.cases.iter().map(|c| c.documents.len()).sum();
    if pct(assigned as usize, expected_docs) < 95.0 {
        problems.push(format!(
            "only {:.0}% of corpus documents were assigned a case (need ≥95%)",
            pct(assigned as usize, expected_docs)
        ));
    }

    if problems.is_empty() {
        println!("\nIndex health: OK");
        Ok(())
    } else {
        println!("\nIndex health: {} problem(s)", problems.len());
        for p in &problems {
            eprintln!("  ✗ {p}");
        }
        Err(format!("Index health check failed ({} problem(s))", problems.len()))
    }
}
