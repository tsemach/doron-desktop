//! Local schema for the desktop→backend contacts link table (see
//! `docs/contact/design.md` §3.2). Contact fields (name/email/phone/organization)
//! are never stored locally — `case_contacts` only points at a backend
//! `contacts.id` (Postgres uuid, stored here as text). Mirrors
//! `store/matcher_schema.rs`'s idempotent `CREATE TABLE IF NOT EXISTS` convention,
//! applied from `open_db_by_path` in `store/mod.rs`.

use rusqlite::Connection;

const CONTACT_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS case_contacts (
        case_id            INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        backend_contact_id TEXT    NOT NULL,
        source              TEXT    NOT NULL,
        added_at            TEXT    NOT NULL,
        PRIMARY KEY (case_id, backend_contact_id)
    );

    CREATE INDEX IF NOT EXISTS idx_case_contacts_case ON case_contacts(case_id);
";

pub fn init_contact_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(CONTACT_SCHEMA)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn creates_table_and_index() {
        let conn = db();
        init_contact_schema(&conn).unwrap();

        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE name = 'case_contacts'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n > 0, "case_contacts was not created");

        let idx: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE name = 'idx_case_contacts_case'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(idx > 0, "idx_case_contacts_case was not created");
    }

    #[test]
    fn is_idempotent() {
        let conn = db();
        init_contact_schema(&conn).unwrap();
        init_contact_schema(&conn).unwrap();
        init_contact_schema(&conn).unwrap();
    }

    #[test]
    fn primary_key_prevents_duplicate_links() {
        let conn = db();
        init_contact_schema(&conn).unwrap();
        conn.execute("INSERT INTO cases (id, name) VALUES (1, 'x')", [])
            .unwrap();

        let insert = |conn: &Connection| {
            conn.execute(
                "INSERT INTO case_contacts (case_id, backend_contact_id, source, added_at)
                 VALUES (1, 'contact-uuid-1', 'manual', 'now')",
                [],
            )
        };
        insert(&conn).unwrap();
        assert!(insert(&conn).is_err(), "duplicate case/contact link must be rejected");
    }

    #[test]
    fn deleting_a_case_cascades_to_its_contacts() {
        let conn = db();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        init_contact_schema(&conn).unwrap();
        conn.execute("INSERT INTO cases (id, name) VALUES (1, 'x')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO case_contacts (case_id, backend_contact_id, source, added_at)
             VALUES (1, 'contact-uuid-1', 'manual', 'now')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM cases WHERE id = 1", []).unwrap();

        let n: i64 = conn
            .query_row("SELECT COUNT(1) FROM case_contacts", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
