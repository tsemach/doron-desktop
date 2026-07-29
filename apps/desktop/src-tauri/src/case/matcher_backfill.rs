//! One-time population of the matcher's derived indexes on an existing profile.
//!
//! A profile that already has cases and documents starts with `case_identifiers`,
//! `case_text_fts` and `documents.case_id` all empty, so a single pass is required
//! before the matcher can find anything.
//!
//! Two properties matter (design §6.2):
//! - it runs **off the DB-open path**, in a background task, because re-scanning every
//!   document path and rebuilding FTS for every case is slow on a large profile;
//! - the marker is set **only on success**. A partially built index is safe — the
//!   matcher just scores lower — but marking it done would strand those cases
//!   permanently unmatchable.

use rusqlite::Connection;

use crate::store::matcher_schema::{marker_is_set, set_marker};

/// Bump the suffix to force a re-run after a change that needs different identifiers.
pub const BACKFILL_MARKER: &str = "index_backfill_v1";

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct BackfillReport {
    pub cases_indexed: usize,
    pub identifiers_mined: usize,
    pub documents_assigned: usize,
}

/// Populate every derived index. Idempotent — safe to call on an already-built profile.
pub fn run_backfill(conn: &Connection) -> Result<BackfillReport, String> {
    let identifiers_mined = crate::case::identifiers::rebuild_all_case_identifiers(conn)?;
    // Case text is indexed after identifiers so identifier values are included in it.
    let cases_indexed = crate::case::case_text_index::rebuild_all_case_text_fts(conn)?;
    let documents_assigned = crate::case::documents_link::backfill_document_case_ids(conn)?;

    Ok(BackfillReport {
        cases_indexed,
        identifiers_mined,
        documents_assigned,
    })
}

/// Run the backfill unless its marker is already set.
pub fn run_backfill_if_needed(conn: &Connection) -> Result<Option<BackfillReport>, String> {
    if marker_is_set(conn, BACKFILL_MARKER) {
        return Ok(None);
    }
    let report = run_backfill(conn)?;
    set_marker(conn, BACKFILL_MARKER).map_err(|e| e.to_string())?;
    Ok(Some(report))
}

/// Entry point for app startup. Never propagates an error: a failed backfill degrades
/// matching but must not prevent the app from starting, and leaving the marker unset
/// means the next launch retries.
pub fn run_backfill_on_startup(app: &tauri::AppHandle) {
    let conn = match crate::store::open_db(app) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[case matcher] backfill skipped, cannot open db: {e}");
            return;
        }
    };

    match run_backfill_if_needed(&conn) {
        Ok(Some(report)) => println!(
            "[case matcher] backfill complete: {} cases, {} identifiers, {} documents linked",
            report.cases_indexed, report.identifiers_mined, report.documents_assigned
        ),
        Ok(None) => {}
        Err(e) => eprintln!("[case matcher] backfill failed (will retry next launch): {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::matcher_schema::{clear_marker, init_matcher_schema};

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, message_id TEXT);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY, message_id TEXT);
             CREATE TABLE case_fields (case_id INTEGER, field_name TEXT, field_value TEXT);
             CREATE TABLE case_annotations (case_id INTEGER PRIMARY KEY, notes TEXT);",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();

        conn.execute_batch(
            "INSERT INTO cases (id, subject, name, folder)
                VALUES (1, 'מכירת דירה', 'דורון מזרחי', '/tmp/cases/a');
             INSERT INTO case_fields (case_id, field_name, field_value)
                VALUES (1, 'גוש ספר:1', '972'), (1, 'חלקה דף:1', '11');
             INSERT INTO documents (id, file_path) VALUES (1, '/tmp/cases/a/deed.docx');
             INSERT INTO documents (id, file_path) VALUES (2, '/tmp/elsewhere/x.docx');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn populates_every_index() {
        let conn = db();
        let report = run_backfill(&conn).unwrap();

        assert_eq!(report.cases_indexed, 1);
        assert!(report.identifiers_mined > 0);
        assert_eq!(report.documents_assigned, 1, "only the in-folder document links");

        let lr: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM case_identifiers WHERE kind = 'land_registry'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(lr, 1, "land-registry composite not assembled");

        let unlinked: Option<i64> = conn
            .query_row("SELECT case_id FROM documents WHERE id = 2", [], |r| r.get(0))
            .unwrap();
        assert_eq!(unlinked, None);
    }

    #[test]
    fn marker_prevents_a_second_run_and_clearing_it_re_runs() {
        let conn = db();
        assert!(run_backfill_if_needed(&conn).unwrap().is_some());
        assert!(
            run_backfill_if_needed(&conn).unwrap().is_none(),
            "marker did not suppress the second run"
        );

        clear_marker(&conn, BACKFILL_MARKER).unwrap();
        assert!(run_backfill_if_needed(&conn).unwrap().is_some());
    }

    #[test]
    fn is_idempotent() {
        let conn = db();
        let first = run_backfill(&conn).unwrap();
        let second = run_backfill(&conn).unwrap();
        assert_eq!(first.cases_indexed, second.cases_indexed);
        assert_eq!(first.documents_assigned, second.documents_assigned);

        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM case_text_fts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1, "repeat backfill duplicated FTS rows");
    }

    #[test]
    fn identifier_values_reach_the_text_index() {
        let conn = db();
        run_backfill(&conn).unwrap();
        // Ordering matters: identifiers are mined before the text index is built, so
        // their raw values are searchable.
        let hits: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM case_text_fts WHERE case_text_fts MATCH '972'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hits, 1);
    }
}
