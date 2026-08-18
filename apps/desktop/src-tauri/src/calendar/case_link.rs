//! Meeting → case auto-linking from a "case: <name>" / "תיק: <name>" phrase in
//! a meeting description (ASC-163 R5). Near-exact matching only -- reuses the
//! same normalizer the email case-matcher's Tier A index uses
//! (email::normalize::normalize_for_match), but does NOT call into
//! case_matcher/match_email_core: that pipeline's fuzzy/content-similarity
//! tiers were tuned against email-length signal, not a one-line description
//! (design.md §6, brainstorm.md §4).

use regex::Regex;
use rusqlite::{params, Connection};
use std::sync::OnceLock;

use crate::email::normalize_for_match;

fn case_phrase_regex() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    // `[ \t]*` (not `\s*`) after the label separator -- `\s` matches `\n` too,
    // which let a blank label line ("case:\n") swallow the newline and
    // capture the *next* line's unrelated text instead of correctly finding
    // no phrase (caught by the `returns_none_for_an_empty_label_value` test).
    PATTERN.get_or_init(|| Regex::new(r#"(?i)(?:case|תיק)\s*[:\-][ \t]*(.+?)(?:\n|$)"#).unwrap())
}

/// Extracts the free-text value following a "case:"/"תיק:" label, up to
/// end-of-line. Mirrors the label-detection idiom in
/// email/emails_classify_deterministic.rs's `case_number_labeled`, but
/// captures free text instead of a numeric case number.
pub fn extract_case_phrase(description: &str) -> Option<String> {
    let phrase = case_phrase_regex().captures(description)?.get(1)?.as_str().trim();
    if phrase.is_empty() {
        None
    } else {
        Some(phrase.to_string())
    }
}

/// Near-exact match: the normalized phrase must equal a case's normalized
/// `name` or `subject` exactly. No fuzzy/partial scoring -- anything that
/// doesn't match closely stays unlinked (design.md §6).
pub fn match_case_by_phrase(conn: &Connection, phrase: &str) -> Result<Option<i64>, String> {
    let target = normalize_for_match(phrase);
    if target.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn
        .prepare("SELECT id, name, subject FROM cases WHERE deleted = 0 OR deleted IS NULL")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (id, name, subject) in rows {
        if normalize_for_match(&name) == target {
            return Ok(Some(id));
        }
        if subject.as_deref().map(normalize_for_match).as_deref() == Some(target.as_str()) {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

/// Combines extraction + matching against a meeting description, returning
/// `(case_id, case_link_source)` ready to pass straight into
/// `store::UpsertMeetingInput`/`store::update_meeting_row`. Shared by the
/// sync poller (every synced event) and the create/update meeting commands
/// (only when the caller didn't already pick a case manually).
pub fn resolve_case_link(conn: &Connection, description: Option<&str>) -> Result<(Option<i64>, String), String> {
    let Some(description) = description else {
        return Ok((None, "none".to_string()));
    };
    let Some(phrase) = extract_case_phrase(description) else {
        return Ok((None, "none".to_string()));
    };
    match match_case_by_phrase(conn, &phrase)? {
        Some(case_id) => Ok((Some(case_id), "phrase_match".to_string())),
        None => Ok((None, "none".to_string())),
    }
}

/// A case's display label (subject if set, else name) -- mirrors how the
/// frontend already picks between them (`c.subject || c.name`, e.g.
/// AppHomeOverview.tsx), used to build the write-back phrase below.
pub fn get_case_label(conn: &Connection, case_id: i64) -> Result<Option<String>, String> {
    let mut stmt = conn.prepare("SELECT subject, name FROM cases WHERE id = ?1").map_err(|e| e.to_string())?;
    let result = stmt.query_row(params![case_id], |row| {
        let subject: Option<String> = row.get(0)?;
        let name: String = row.get(1)?;
        Ok(subject.unwrap_or(name))
    });
    match result {
        Ok(label) => Ok(Some(label)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Write-back for a manual case attach (the reverse of `resolve_case_link`):
/// appends a "case:"/"תיק:" line to `description` if it doesn't already
/// resolve to `case_name`, so the link is visible in Google Calendar itself
/// -- not just inside Ascurix. A no-op if the description already carries an
/// equivalent phrase (e.g. the meeting was originally auto-detected, or a
/// previous manual save already wrote it), so re-saving is idempotent and
/// doesn't pile up duplicate lines. Label language follows `case_name`'s own
/// script (Hebrew characters -> "תיק:", else "Case:") since this is called
/// from Rust with no direct signal for the frontend's current UI language.
pub fn ensure_case_phrase_in_description(description: Option<&str>, case_name: &str) -> String {
    let existing = description.unwrap_or("");
    if let Some(existing_phrase) = extract_case_phrase(existing) {
        if normalize_for_match(&existing_phrase) == normalize_for_match(case_name) {
            return existing.to_string();
        }
    }

    // Strip any existing case:/תיק: line (stale -- points at a different
    // case, or wouldn't have reached here) rather than appending a fresh
    // line and leaving the old one dangling as a confusing duplicate.
    let stripped = existing
        .lines()
        .filter(|line| case_phrase_regex().find(line).is_none())
        .collect::<Vec<_>>()
        .join("\n");
    let stripped = stripped.trim();

    let is_hebrew = case_name.chars().any(|c| ('\u{0590}'..='\u{05FF}').contains(&c));
    let label = if is_hebrew { "תיק" } else { "Case" };
    if stripped.is_empty() {
        format!("{label}: {case_name}")
    } else {
        format!("{stripped}\n{label}: {case_name}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_english_phrase() {
        assert_eq!(extract_case_phrase("Meeting notes\ncase: Cohen v. Levy\nmore text").as_deref(), Some("Cohen v. Levy"));
    }

    #[test]
    fn extracts_hebrew_phrase() {
        assert_eq!(extract_case_phrase("תיק: כהן נגד לוי").as_deref(), Some("כהן נגד לוי"));
    }

    #[test]
    fn is_case_insensitive_for_the_english_label() {
        assert_eq!(extract_case_phrase("CASE: Smith Matter").as_deref(), Some("Smith Matter"));
    }

    #[test]
    fn accepts_a_dash_after_the_label() {
        assert_eq!(extract_case_phrase("case - Smith Matter").as_deref(), Some("Smith Matter"));
    }

    #[test]
    fn returns_none_without_a_label() {
        assert_eq!(extract_case_phrase("Just a regular meeting description"), None);
    }

    #[test]
    fn returns_none_for_an_empty_label_value() {
        assert_eq!(extract_case_phrase("case:   \nother text"), None);
    }

    #[test]
    fn stops_at_end_of_line_not_the_whole_description() {
        assert_eq!(extract_case_phrase("case: Smith Matter\nSecond line unrelated").as_deref(), Some("Smith Matter"));
    }

    fn conn_with_cases(rows: &[(i64, &str, Option<&str>)]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, name TEXT, subject TEXT, deleted INTEGER DEFAULT 0);",
        )
        .unwrap();
        for (id, name, subject) in rows {
            conn.execute(
                "INSERT INTO cases (id, name, subject) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, name, subject],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn matches_case_name_exactly_after_normalization() {
        let conn = conn_with_cases(&[(1, "Cohen v. Levy", None)]);
        assert_eq!(match_case_by_phrase(&conn, "cohen v levy").unwrap(), Some(1));
    }

    #[test]
    fn matches_case_subject_when_name_does_not_match() {
        let conn = conn_with_cases(&[(1, "Internal file 42", Some("Smith Matter"))]);
        assert_eq!(match_case_by_phrase(&conn, "Smith Matter").unwrap(), Some(1));
    }

    #[test]
    fn no_match_when_nothing_lines_up() {
        let conn = conn_with_cases(&[(1, "Cohen v. Levy", None)]);
        assert_eq!(match_case_by_phrase(&conn, "Totally unrelated name").unwrap(), None);
    }

    #[test]
    fn ignores_deleted_cases() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, name TEXT, subject TEXT, deleted INTEGER DEFAULT 0);
             INSERT INTO cases (id, name, deleted) VALUES (1, 'Cohen v. Levy', 1);",
        )
        .unwrap();
        assert_eq!(match_case_by_phrase(&conn, "Cohen v. Levy").unwrap(), None);
    }

    #[test]
    fn write_back_appends_english_label_for_empty_description() {
        assert_eq!(ensure_case_phrase_in_description(None, "Smith Matter"), "Case: Smith Matter");
        assert_eq!(ensure_case_phrase_in_description(Some("  "), "Smith Matter"), "Case: Smith Matter");
    }

    #[test]
    fn write_back_appends_hebrew_label_for_hebrew_case_names() {
        assert_eq!(ensure_case_phrase_in_description(None, "כהן נגד לוי"), "תיק: כהן נגד לוי");
    }

    #[test]
    fn write_back_appends_on_a_new_line_when_description_already_has_content() {
        assert_eq!(
            ensure_case_phrase_in_description(Some("Discuss settlement terms"), "Smith Matter"),
            "Discuss settlement terms\nCase: Smith Matter"
        );
    }

    #[test]
    fn write_back_is_idempotent_when_the_right_phrase_is_already_present() {
        let description = "case: Smith Matter";
        assert_eq!(ensure_case_phrase_in_description(Some(description), "Smith Matter"), description);
    }

    #[test]
    fn write_back_replaces_a_stale_phrase_for_a_different_case() {
        assert_eq!(ensure_case_phrase_in_description(Some("case: Old Matter"), "New Matter"), "Case: New Matter");
    }

    #[test]
    fn write_back_replaces_a_stale_phrase_while_keeping_other_content() {
        assert_eq!(
            ensure_case_phrase_in_description(Some("Discuss terms\ncase: Old Matter\nBring documents"), "New Matter"),
            "Discuss terms\nBring documents\nCase: New Matter"
        );
    }
}
