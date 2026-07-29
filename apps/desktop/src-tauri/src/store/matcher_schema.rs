//! Schema for the deterministic email→case matcher (see `docs/emails/case_matcher_design.md` §4).
//!
//! Kept out of `store/mod.rs` to avoid growing that file further. Applied from
//! `open_db_by_path` after `init_documents_schema`, since it adds a column to `documents`.
//! Everything here is idempotent — `CREATE TABLE IF NOT EXISTS` plus `pragma_table_info`
//! guards for added columns, matching the convention already used in this crate.

use rusqlite::Connection;

const MATCHER_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS case_identifiers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id     INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        kind        TEXT    NOT NULL,
        role        TEXT,
        value_norm  TEXT    NOT NULL,
        value_raw   TEXT    NOT NULL,
        source      TEXT    NOT NULL,
        weight      REAL    NOT NULL DEFAULT 1.0,
        created_at  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_case_ident_lookup ON case_identifiers(kind, value_norm);
    CREATE INDEX IF NOT EXISTS idx_case_ident_case   ON case_identifiers(case_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_case_ident_uniq
        ON case_identifiers(case_id, kind, value_norm);

    CREATE TABLE IF NOT EXISTS case_matcher_settings (
        key         TEXT PRIMARY KEY,
        value_json  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS case_text_fts USING fts5(
        subject, name, notes, field_values, identifier_values,
        tokenize = 'unicode61 remove_diacritics 2'
    );
";

/// Columns added to existing tables, guarded so re-opening an already-migrated
/// database is a no-op.
const ADDED_COLUMNS: &[(&str, &str, &str)] = &[
    ("documents", "case_id", "INTEGER REFERENCES cases(id) ON DELETE SET NULL"),
    ("case_emails", "in_reply_to", "TEXT"),
    ("case_emails", "references_ids", "TEXT"),
    ("pending_email_alerts", "in_reply_to", "TEXT"),
    ("pending_email_alerts", "references_ids", "TEXT"),
];

fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info(?1) WHERE name = ?2",
        rusqlite::params![table, column],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

pub fn init_matcher_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(MATCHER_SCHEMA)?;

    for (table, column, ty) in ADDED_COLUMNS {
        if !column_exists(conn, table, column) {
            // SQLite cannot add a column with a non-constant default; these are all
            // nullable so the ALTER is safe on a populated table.
            conn.execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {ty};"),
                [],
            )?;
        }
    }

    // Created after the column exists, hence not part of MATCHER_SCHEMA.
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);")?;

    Ok(())
}

// ── Marker rows ──────────────────────────────────────────────────────────────
// One-time migrations record completion in `case_matcher_settings` rather than via
// PRAGMA user_version, which this crate does not use. Bumping a marker's suffix
// re-runs the corresponding backfill after a change that needs different data.

pub fn marker_is_set(conn: &Connection, key: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(1) FROM case_matcher_settings WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

pub fn set_marker(conn: &Connection, key: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO case_matcher_settings (key, value_json, updated_at)
         VALUES (?1, 'true', ?2)",
        rusqlite::params![key, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}

pub fn clear_marker(conn: &Connection, key: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM case_matcher_settings WHERE key = ?1",
        rusqlite::params![key],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, message_id TEXT);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY, message_id TEXT);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn creates_tables_and_columns() {
        let conn = db();
        init_matcher_schema(&conn).unwrap();

        for table in ["case_identifiers", "case_matcher_settings", "case_text_fts"] {
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(1) FROM sqlite_master WHERE name = ?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )
                .unwrap();
            assert!(n > 0, "{table} was not created");
        }
        assert!(column_exists(&conn, "documents", "case_id"));
        assert!(column_exists(&conn, "case_emails", "in_reply_to"));
        assert!(column_exists(&conn, "pending_email_alerts", "references_ids"));
    }

    #[test]
    fn is_idempotent() {
        let conn = db();
        init_matcher_schema(&conn).unwrap();
        init_matcher_schema(&conn).unwrap();
        init_matcher_schema(&conn).unwrap();
    }

    #[test]
    fn identifier_uniqueness_is_enforced() {
        let conn = db();
        init_matcher_schema(&conn).unwrap();
        conn.execute("INSERT INTO cases (id, name) VALUES (1, 'x')", [])
            .unwrap();

        let insert = |conn: &Connection| {
            conn.execute(
                "INSERT INTO case_identifiers (case_id, kind, value_norm, value_raw, source, created_at)
                 VALUES (1, 'case_number', '12345/23', '12345/23', 'case_fields', 'now')",
                [],
            )
        };
        insert(&conn).unwrap();
        assert!(insert(&conn).is_err(), "duplicate identifier must be rejected");
    }

    #[test]
    fn deleting_a_case_cascades_to_its_identifiers() {
        let conn = db();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        init_matcher_schema(&conn).unwrap();
        conn.execute("INSERT INTO cases (id, name) VALUES (1, 'x')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO case_identifiers (case_id, kind, value_norm, value_raw, source, created_at)
             VALUES (1, 'email', 'a@b.com', 'a@b.com', 'case_fields', 'now')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM cases WHERE id = 1", []).unwrap();

        let n: i64 = conn
            .query_row("SELECT COUNT(1) FROM case_identifiers", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn markers_round_trip() {
        let conn = db();
        init_matcher_schema(&conn).unwrap();
        assert!(!marker_is_set(&conn, "index_backfill_v1"));
        set_marker(&conn, "index_backfill_v1").unwrap();
        assert!(marker_is_set(&conn, "index_backfill_v1"));
        set_marker(&conn, "index_backfill_v1").unwrap(); // idempotent
        clear_marker(&conn, "index_backfill_v1").unwrap();
        assert!(!marker_is_set(&conn, "index_backfill_v1"));
    }
}
