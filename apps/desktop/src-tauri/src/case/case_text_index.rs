//! Maintains `case_text_fts`, the full-text index over a case's own metadata (design §4.3).
//!
//! Tier B scores an email against two things: the case's documents, and the case itself.
//! This index is the second half, and it matters more than it might look — document
//! linkage depends on users filing files into case folders, whereas subject, name, notes
//! and fields are always present. A case with no documents is still matchable through here.

use rusqlite::{params, Connection};

/// `rowid` is the case id, so lookups join straight back to `cases`.
pub fn rebuild_case_text_fts(conn: &Connection, case_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM case_text_fts WHERE rowid = ?1",
        params![case_id],
    )
    .map_err(|e| format!("[case_text_fts clear] {e}"))?;

    let (subject, name): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT subject, name FROM cases WHERE id = ?1",
            params![case_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("[case {case_id} not found] {e}"))?;

    let notes: Option<String> = conn
        .query_row(
            "SELECT notes FROM case_annotations WHERE case_id = ?1",
            params![case_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();

    let field_values = collect(
        conn,
        "SELECT field_value FROM case_fields WHERE case_id = ?1",
        case_id,
    )?;
    // Raw identifier values are indexed too, so a term that only appears as an
    // identifier (a deed number, a party spelling) is still reachable by full text.
    let identifier_values = collect(
        conn,
        "SELECT value_raw FROM case_identifiers WHERE case_id = ?1",
        case_id,
    )?;

    conn.execute(
        "INSERT INTO case_text_fts (rowid, subject, name, notes, field_values, identifier_values)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            case_id,
            subject.unwrap_or_default(),
            name.unwrap_or_default(),
            notes.unwrap_or_default(),
            field_values,
            identifier_values,
        ],
    )
    .map_err(|e| format!("[case_text_fts insert] {e}"))?;

    Ok(())
}

fn collect(conn: &Connection, sql: &str, case_id: i64) -> Result<String, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![case_id], |r| r.get::<_, Option<String>>(0))
        .map_err(|e| e.to_string())?;
    Ok(rows
        .flatten()
        .flatten()
        .filter(|v| !v.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" "))
}

pub fn rebuild_all_case_text_fts(conn: &Connection) -> Result<usize, String> {
    let ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM cases WHERE deleted = 0 OR deleted IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };
    let count = ids.len();
    for id in ids {
        rebuild_case_text_fts(conn, id)?;
    }
    Ok(count)
}

pub fn remove_case_from_text_fts(conn: &Connection, case_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM case_text_fts WHERE rowid = ?1",
        params![case_id],
    )
    .map_err(|e| format!("[case_text_fts delete] {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::matcher_schema::init_matcher_schema;

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
        conn
    }

    fn seed(conn: &Connection) {
        conn.execute(
            "INSERT INTO cases (id, subject, name) VALUES (1, 'מכירת דירה בנאמנות', 'דורון מזרחי')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO case_fields (case_id, field_name, field_value) VALUES (1, 'ישוב', 'אילת')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO case_annotations (case_id, notes) VALUES (1, 'הערה על חניה ומחסן')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO case_identifiers (case_id, kind, value_norm, value_raw, source, created_at)
             VALUES (1, 'deed', '4471', 'שטר 4471', 'case_fields', 'now')",
            [],
        )
        .unwrap();
    }

    fn search(conn: &Connection, query: &str) -> Vec<i64> {
        let mut stmt = conn
            .prepare("SELECT rowid FROM case_text_fts WHERE case_text_fts MATCH ?1")
            .unwrap();
        let rows = stmt.query_map(params![query], |r| r.get::<_, i64>(0)).unwrap();
        rows.flatten().collect()
    }

    #[test]
    fn indexes_every_text_source() {
        let conn = db();
        seed(&conn);
        rebuild_case_text_fts(&conn, 1).unwrap();

        assert_eq!(search(&conn, "בנאמנות"), vec![1], "subject not indexed");
        assert_eq!(search(&conn, "מזרחי"), vec![1], "name not indexed");
        assert_eq!(search(&conn, "אילת"), vec![1], "field values not indexed");
        assert_eq!(search(&conn, "חניה"), vec![1], "notes not indexed");
        assert_eq!(search(&conn, "4471"), vec![1], "identifier values not indexed");
    }

    /// Pins a known limitation rather than hiding it (design §10.3).
    ///
    /// FTS5's `unicode61` tokenizer splits on non-letters and does no morphology, so a
    /// Hebrew clitic binds to its word: the note contains `ומחסן`, and a bare `מחסן`
    /// query does not reach it. Tier B must therefore expand query terms with
    /// `normalize::match_variants` rather than assume the index will do it. If this test
    /// ever starts passing, the tokenizer changed and that expansion can be revisited.
    #[test]
    fn clitic_prefixes_bind_to_their_word_in_fts() {
        let conn = db();
        seed(&conn); // notes contain "ומחסן"
        rebuild_case_text_fts(&conn, 1).unwrap();

        assert!(
            search(&conn, "מחסן").is_empty(),
            "unexpected: the tokenizer now splits Hebrew clitics"
        );
        assert_eq!(search(&conn, "ומחסן"), vec![1]);
        // The prefix form the query side will actually use.
        assert_eq!(search(&conn, "מחסן*"), Vec::<i64>::new());
        assert_eq!(search(&conn, "ומחס*"), vec![1]);
    }

    #[test]
    fn rebuild_replaces_rather_than_duplicates() {
        let conn = db();
        seed(&conn);
        rebuild_case_text_fts(&conn, 1).unwrap();
        rebuild_case_text_fts(&conn, 1).unwrap();
        rebuild_case_text_fts(&conn, 1).unwrap();

        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM case_text_fts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        assert_eq!(search(&conn, "בנאמנות"), vec![1]);
    }

    #[test]
    fn reflects_updated_case_text() {
        let conn = db();
        seed(&conn);
        rebuild_case_text_fts(&conn, 1).unwrap();

        conn.execute("UPDATE cases SET subject = 'רישום משכנתא' WHERE id = 1", [])
            .unwrap();
        rebuild_case_text_fts(&conn, 1).unwrap();

        assert!(search(&conn, "בנאמנות").is_empty(), "stale text still indexed");
        assert_eq!(search(&conn, "משכנתא"), vec![1]);
    }

    #[test]
    fn case_with_no_metadata_still_gets_a_row() {
        let conn = db();
        conn.execute("INSERT INTO cases (id, name) VALUES (2, '')", [])
            .unwrap();
        rebuild_case_text_fts(&conn, 2).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM case_text_fts WHERE rowid = 2", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn rebuild_all_covers_active_cases_only() {
        let conn = db();
        seed(&conn);
        conn.execute(
            "INSERT INTO cases (id, subject, name, deleted) VALUES (2, 'תביעה', 'כהן', 1)",
            [],
        )
        .unwrap();
        assert_eq!(rebuild_all_case_text_fts(&conn).unwrap(), 1);
        assert!(search(&conn, "תביעה").is_empty());
    }

    #[test]
    fn removal_drops_the_row() {
        let conn = db();
        seed(&conn);
        rebuild_case_text_fts(&conn, 1).unwrap();
        remove_case_from_text_fts(&conn, 1).unwrap();
        assert!(search(&conn, "בנאמנות").is_empty());
    }
}
