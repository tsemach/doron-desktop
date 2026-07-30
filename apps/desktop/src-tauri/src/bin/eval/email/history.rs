//! Persists matcher eval runs so phases can be compared.
//!
//! Lands in P4 rather than later on purpose: P5's entire claim is "Tiers B/C improved
//! `medium`/`hard`", and that is only checkable against a recorded P4 baseline. Shares
//! `evaluation_history.db` with the document eval rather than adding another database.

use rusqlite::{params, Connection};

use tauri_app_lib::store;

use super::matcher_metrics::Summary;

const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS email_matcher_runs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        run_at        TEXT NOT NULL,
        label         TEXT,
        corpus_dir    TEXT NOT NULL,
        emails        INTEGER NOT NULL,
        cases         INTEGER NOT NULL,
        accuracy_at_1 REAL NOT NULL,
        precision     REAL NOT NULL,
        recall        REAL NOT NULL,
        f1            REAL NOT NULL,
        mrr           REAL NOT NULL,
        mislinks      INTEGER NOT NULL,
        false_positives INTEGER NOT NULL,
        missed        INTEGER NOT NULL,
        per_difficulty_json TEXT NOT NULL,
        per_practice_json   TEXT NOT NULL,
        per_signal_json     TEXT NOT NULL,
        config_json         TEXT NOT NULL
    );
";

pub fn open() -> Result<Connection, String> {
    let path = store::cli_db_path("evaluation_history.db");
    let conn = Connection::open(&path)
        .map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("[email_matcher_runs schema] {e}"))?;
    Ok(conn)
}

pub fn save(
    summary: &Summary,
    corpus_dir: &str,
    cases: usize,
    label: Option<&str>,
    config_json: &str,
) -> Result<i64, String> {
    let conn = open()?;

    let per_difficulty: Vec<(String, usize, usize)> = summary
        .per_difficulty
        .iter()
        .map(|(d, s)| (d.label().to_string(), s.correct, s.total))
        .collect();
    let per_practice: Vec<(String, usize, usize)> = summary
        .per_practice
        .iter()
        .map(|(p, s)| (p.to_string(), s.correct, s.total))
        .collect();

    conn.execute(
        "INSERT INTO email_matcher_runs
            (run_at, label, corpus_dir, emails, cases, accuracy_at_1, precision, recall, f1,
             mrr, mislinks, false_positives, missed,
             per_difficulty_json, per_practice_json, per_signal_json, config_json)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![
            chrono::Utc::now().to_rfc3339(),
            label,
            corpus_dir,
            summary.total as i64,
            cases as i64,
            summary.accuracy_at_1,
            summary.precision,
            summary.recall,
            summary.f1,
            summary.mrr,
            summary.mislinks as i64,
            summary.false_positives as i64,
            summary.missed as i64,
            serde_json::to_string(&per_difficulty).unwrap_or_default(),
            serde_json::to_string(&per_practice).unwrap_or_default(),
            serde_json::to_string(&summary.per_signal).unwrap_or_default(),
            config_json,
        ],
    )
    .map_err(|e| format!("[save matcher run] {e}"))?;

    Ok(conn.last_insert_rowid())
}

pub struct RunRow {
    pub id: i64,
    pub run_at: String,
    pub label: Option<String>,
    pub emails: i64,
    pub accuracy_at_1: f64,
    pub f1: f64,
    pub mislinks: i64,
}

pub fn list(limit: usize) -> Result<Vec<RunRow>, String> {
    let conn = open()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, run_at, label, emails, accuracy_at_1, f1, mislinks
             FROM email_matcher_runs ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit as i64], |r| {
            Ok(RunRow {
                id: r.get(0)?,
                run_at: r.get(1)?,
                label: r.get(2)?,
                emails: r.get(3)?,
                accuracy_at_1: r.get(4)?,
                f1: r.get(5)?,
                mislinks: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

/// Full detail for one run, as label/value pairs for printing.
pub fn show(id: i64) -> Result<Vec<(String, String)>, String> {
    let conn = open()?;
    conn.query_row(
        "SELECT run_at, label, corpus_dir, emails, cases, accuracy_at_1, precision, recall, f1,
                mrr, mislinks, false_positives, missed,
                per_difficulty_json, per_practice_json, per_signal_json, config_json
         FROM email_matcher_runs WHERE id = ?1",
        params![id],
        |r| {
            Ok(vec![
                ("run_at".into(), r.get::<_, String>(0)?),
                ("label".into(), r.get::<_, Option<String>>(1)?.unwrap_or_default()),
                ("corpus_dir".into(), r.get::<_, String>(2)?),
                ("emails".into(), r.get::<_, i64>(3)?.to_string()),
                ("cases".into(), r.get::<_, i64>(4)?.to_string()),
                ("accuracy@1".into(), format!("{:.1}%", r.get::<_, f64>(5)?)),
                ("precision".into(), format!("{:.2}", r.get::<_, f64>(6)?)),
                ("recall".into(), format!("{:.2}", r.get::<_, f64>(7)?)),
                ("f1".into(), format!("{:.2}", r.get::<_, f64>(8)?)),
                ("mrr".into(), format!("{:.2}", r.get::<_, f64>(9)?)),
                ("mislinks".into(), r.get::<_, i64>(10)?.to_string()),
                ("false_positives".into(), r.get::<_, i64>(11)?.to_string()),
                ("missed".into(), r.get::<_, i64>(12)?.to_string()),
                ("per_difficulty".into(), r.get::<_, String>(13)?),
                ("per_practice".into(), r.get::<_, String>(14)?),
                ("per_signal".into(), r.get::<_, String>(15)?),
                ("config".into(), r.get::<_, String>(16)?),
            ])
        },
    )
    .map_err(|e| format!("Run {id} not found: {e}"))
}
