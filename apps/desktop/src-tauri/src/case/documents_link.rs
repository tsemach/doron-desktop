//! Sets `documents.case_id` — the case↔document relation Tier B joins on (design §4.2).
//!
//! The column is nullable by design: the app indexes arbitrary folders, and on a real
//! profile most indexed documents sit outside any case. `NULL` means "indexed, not part
//! of a case", which is a normal state rather than missing data.
//!
//! Assignment is derived from the file's location under a `cases.folder`, computed once
//! at index time instead of per candidate case per email. Callers that already know the
//! case (add-to-case, attachment import) should set the column directly and skip this.

use rusqlite::{params, Connection};

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// A folder prefix that cannot swallow a sibling.
///
/// P0 measured the failure this prevents: with a bare `folder || '%'`, a case folder
/// `…/remove-me` matched every file under `…/remove-me2`, attributing 17 documents to a
/// case that owns 8 and silently merging two cases' corpora. The trailing separator is
/// what makes the prefix a directory boundary.
fn folder_prefix(folder: &str) -> Option<String> {
    let normalized = normalize_path(folder.trim());
    if normalized.is_empty() {
        return None;
    }
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    Some(format!("{trimmed}/"))
}

/// True when `file_path` lies inside `folder` (at any depth).
pub fn path_is_under(file_path: &str, folder: &str) -> bool {
    match folder_prefix(folder) {
        Some(prefix) => normalize_path(file_path).starts_with(&prefix),
        None => false,
    }
}

fn load_case_folders(conn: &Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, folder FROM cases
             WHERE (deleted = 0 OR deleted IS NULL) AND folder IS NOT NULL AND folder <> ''",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

/// Resolve which case owns a path. Returns `None` when nothing matches — and also when
/// *several* cases match, since nested or duplicated case folders make the answer
/// genuinely ambiguous and a wrong assignment is worse than none.
pub fn resolve_case_for_path(file_path: &str, folders: &[(i64, String)]) -> Option<i64> {
    let mut matches = folders
        .iter()
        .filter(|(_, folder)| path_is_under(file_path, folder));

    let (first_id, _) = matches.next()?;
    if matches.next().is_some() {
        return None;
    }
    Some(*first_id)
}

/// Derive and store `case_id` for one document. Returns the assigned case, if any.
pub fn assign_document_case(conn: &Connection, document_id: i64) -> Result<Option<i64>, String> {
    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM documents WHERE id = ?1",
            params![document_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("[document {document_id} not found] {e}"))?;

    let folders = load_case_folders(conn)?;
    let case_id = resolve_case_for_path(&file_path, &folders);

    conn.execute(
        "UPDATE documents SET case_id = ?1 WHERE id = ?2",
        params![case_id, document_id],
    )
    .map_err(|e| format!("[documents.case_id update] {e}"))?;

    Ok(case_id)
}

/// Re-derive assignments for one case's folder. Call when a case's folder changes:
/// documents that moved out must lose the link, not keep a stale one.
pub fn reassign_documents_for_case(conn: &Connection, case_id: i64) -> Result<usize, String> {
    conn.execute(
        "UPDATE documents SET case_id = NULL WHERE case_id = ?1",
        params![case_id],
    )
    .map_err(|e| format!("[documents.case_id clear] {e}"))?;

    let folder: Option<String> = conn
        .query_row(
            "SELECT folder FROM cases WHERE id = ?1",
            params![case_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("[case {case_id} not found] {e}"))?;

    let Some(prefix) = folder.as_deref().and_then(folder_prefix) else {
        return Ok(0);
    };
    let folders = load_case_folders(conn)?;

    let candidates: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM documents WHERE REPLACE(file_path, '\\', '/') LIKE ?1 || '%'")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![prefix], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    let mut assigned = 0;
    for id in candidates {
        // Re-resolve rather than trusting the LIKE: another case's folder may also
        // contain this path, in which case it must stay NULL.
        if assign_document_case(conn, id)? == Some(case_id) {
            assigned += 1;
        }
    }
    Ok(assigned)
}

/// One-time migration pass over every document. Idempotent.
pub fn backfill_document_case_ids(conn: &Connection) -> Result<usize, String> {
    let folders = load_case_folders(conn)?;
    if folders.is_empty() {
        return Ok(0);
    }

    let documents: Vec<(i64, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, file_path FROM documents")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    let mut assigned = 0;
    let mut stmt = conn
        .prepare("UPDATE documents SET case_id = ?1 WHERE id = ?2")
        .map_err(|e| e.to_string())?;

    for (id, path) in documents {
        if let Some(case_id) = resolve_case_for_path(&path, &folders) {
            stmt.execute(params![case_id, id])
                .map_err(|e| format!("[backfill update] {e}"))?;
            assigned += 1;
        }
    }
    Ok(assigned)
}

/// Directly link a document to a known case, skipping path derivation. Used by
/// add-to-case and attachment import, which already know the answer.
pub fn set_document_case(
    conn: &Connection,
    document_id: i64,
    case_id: Option<i64>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE documents SET case_id = ?1 WHERE id = ?2",
        params![case_id, document_id],
    )
    .map_err(|e| format!("[documents.case_id set] {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT, case_id INTEGER);",
        )
        .unwrap();
        conn
    }

    fn add_case(conn: &Connection, id: i64, folder: &str) {
        conn.execute(
            "INSERT INTO cases (id, folder) VALUES (?1, ?2)",
            params![id, folder],
        )
        .unwrap();
    }

    fn add_doc(conn: &Connection, id: i64, path: &str) {
        conn.execute(
            "INSERT INTO documents (id, file_path) VALUES (?1, ?2)",
            params![id, path],
        )
        .unwrap();
    }

    fn case_of(conn: &Connection, doc: i64) -> Option<i64> {
        conn.query_row(
            "SELECT case_id FROM documents WHERE id = ?1",
            params![doc],
            |r| r.get(0),
        )
        .unwrap()
    }

    /// The exact failure P0 measured on a real profile.
    #[test]
    fn sibling_folder_does_not_swallow_its_neighbour() {
        let conn = db();
        add_case(&conn, 33, "/tmp/remove-me");
        add_case(&conn, 34, "/tmp/remove-me2");
        add_doc(&conn, 1, "/tmp/remove-me/a.docx");
        add_doc(&conn, 2, "/tmp/remove-me2/b.docx");

        assign_document_case(&conn, 1).unwrap();
        assign_document_case(&conn, 2).unwrap();

        assert_eq!(case_of(&conn, 1), Some(33));
        assert_eq!(case_of(&conn, 2), Some(34), "remove-me swallowed remove-me2");
    }

    #[test]
    fn documents_outside_any_case_stay_null() {
        let conn = db();
        add_case(&conn, 1, "/tmp/cases/a");
        add_doc(&conn, 1, "/tmp/other/report.docx");
        assert_eq!(assign_document_case(&conn, 1).unwrap(), None);
        assert_eq!(case_of(&conn, 1), None);
    }

    #[test]
    fn nested_case_folders_are_ambiguous_and_left_null() {
        let conn = db();
        add_case(&conn, 1, "/tmp/cases");
        add_case(&conn, 2, "/tmp/cases/inner");
        add_doc(&conn, 1, "/tmp/cases/inner/doc.docx");
        assert_eq!(
            assign_document_case(&conn, 1).unwrap(),
            None,
            "a path under two case folders must not be guessed"
        );
    }

    #[test]
    fn windows_paths_normalize() {
        let conn = db();
        add_case(&conn, 7, r"C:\cases\smith");
        add_doc(&conn, 1, r"C:\cases\smith\claim.docx");
        assert_eq!(assign_document_case(&conn, 1).unwrap(), Some(7));
    }

    #[test]
    fn nested_subdirectories_still_belong_to_the_case() {
        let conn = db();
        add_case(&conn, 5, "/tmp/cases/a");
        add_doc(&conn, 1, "/tmp/cases/a/.attachments/deep/file.docx");
        assert_eq!(assign_document_case(&conn, 1).unwrap(), Some(5));
    }

    #[test]
    fn folder_with_trailing_slash_behaves_the_same() {
        let conn = db();
        add_case(&conn, 9, "/tmp/cases/a/");
        add_doc(&conn, 1, "/tmp/cases/a/file.docx");
        assert_eq!(assign_document_case(&conn, 1).unwrap(), Some(9));
    }

    #[test]
    fn the_folder_itself_is_not_a_document_of_the_case() {
        // A path equal to the folder has no trailing separator and must not match.
        assert!(!path_is_under("/tmp/cases/a", "/tmp/cases/a"));
        assert!(path_is_under("/tmp/cases/a/x.docx", "/tmp/cases/a"));
    }

    #[test]
    fn deleted_cases_are_ignored() {
        let conn = db();
        add_case(&conn, 1, "/tmp/cases/a");
        conn.execute("UPDATE cases SET deleted = 1 WHERE id = 1", [])
            .unwrap();
        add_doc(&conn, 1, "/tmp/cases/a/file.docx");
        assert_eq!(assign_document_case(&conn, 1).unwrap(), None);
    }

    #[test]
    fn backfill_assigns_all_and_is_idempotent() {
        let conn = db();
        add_case(&conn, 1, "/tmp/cases/a");
        add_case(&conn, 2, "/tmp/cases/b");
        add_doc(&conn, 1, "/tmp/cases/a/one.docx");
        add_doc(&conn, 2, "/tmp/cases/a/two.docx");
        add_doc(&conn, 3, "/tmp/cases/b/three.docx");
        add_doc(&conn, 4, "/tmp/elsewhere/four.docx");

        assert_eq!(backfill_document_case_ids(&conn).unwrap(), 3);
        assert_eq!(backfill_document_case_ids(&conn).unwrap(), 3);
        assert_eq!(case_of(&conn, 1), Some(1));
        assert_eq!(case_of(&conn, 3), Some(2));
        assert_eq!(case_of(&conn, 4), None);
    }

    #[test]
    fn reassign_clears_documents_that_left_the_folder() {
        let conn = db();
        add_case(&conn, 1, "/tmp/cases/a");
        add_doc(&conn, 1, "/tmp/cases/a/one.docx");
        backfill_document_case_ids(&conn).unwrap();
        assert_eq!(case_of(&conn, 1), Some(1));

        // Case folder moves; the old document is no longer inside it.
        conn.execute("UPDATE cases SET folder = '/tmp/cases/moved' WHERE id = 1", [])
            .unwrap();
        reassign_documents_for_case(&conn, 1).unwrap();
        assert_eq!(case_of(&conn, 1), None, "stale link survived a folder move");
    }

    #[test]
    fn set_document_case_overrides_derivation() {
        let conn = db();
        add_doc(&conn, 1, "/tmp/anywhere/file.docx");
        set_document_case(&conn, 1, Some(42)).unwrap();
        assert_eq!(case_of(&conn, 1), Some(42));
        set_document_case(&conn, 1, None).unwrap();
        assert_eq!(case_of(&conn, 1), None);
    }
}
