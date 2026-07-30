//! Tier C — fuzzy entity matching (design §5.5).
//!
//! Catches the spelling drift Tier B misses: an email from `מזרחי-כהן` about a case whose
//! party is `מזרחי`. Exact lookup fails, and vocabulary overlap says nothing, but the
//! names are obviously the same person to a human.
//!
//! The name usually arrives as the sender's display name rather than as an extracted
//! signal — the deterministic extractor matches adversarial *pairs* (`X נ' Y`), never a
//! standalone name in prose, since that needs NER and would flag every capitalised word
//! pair (see AMI-113). So the From header is the primary input here.

use rusqlite::Connection;
use strsim::jaro_winkler;

use crate::case::identifiers as ids;
use crate::email::emails_case_api::CaseMatchRequest;
use crate::email::normalize_for_match;

use super::config::MatcherConfig;
use super::scoring::SignalContribution;

/// Below this, two names are different people. Jaro-Winkler favours a shared prefix,
/// which suits surname variants and hyphenated compounds.
const SIMILARITY_FLOOR: f64 = 0.85;

/// Names too short to compare safely — a 2-3 character token matches far too much.
const MIN_NAME_CHARS: usize = 4;

fn candidate_names(request: &CaseMatchRequest) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let push = |value: &str, names: &mut Vec<String>| {
        let normalized = normalize_for_match(value);
        if normalized.chars().count() >= MIN_NAME_CHARS && !names.contains(&normalized) {
            names.push(normalized);
        }
    };

    if let Some(name) = &request.deterministic.sender_name {
        push(name, &mut names);
    }
    for party in &request.deterministic.party_names {
        push(party, &mut names);
    }
    names
}

fn case_parties(conn: &Connection) -> Result<Vec<(i64, String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT case_id, value_norm, value_raw FROM case_identifiers WHERE kind = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([ids::KIND_PARTY_NAME], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

/// Similarity of two names, comparing whole strings and individual words.
///
/// Word-level comparison is what catches `נועה יוסף` against `יוסף` — a party recorded
/// by surname only, or a display name carrying an extra given name.
pub fn name_similarity(a: &str, b: &str) -> f64 {
    let whole = jaro_winkler(a, b);

    let a_words: Vec<&str> = a.split(' ').filter(|w| w.chars().count() >= 3).collect();
    let b_words: Vec<&str> = b.split(' ').filter(|w| w.chars().count() >= 3).collect();

    let mut best_word: f64 = 0.0;
    for aw in &a_words {
        for bw in &b_words {
            best_word = best_word.max(jaro_winkler(aw, bw));
        }
    }
    // A single strong word match is weaker evidence than the whole name agreeing.
    whole.max(best_word * 0.92)
}

pub fn evaluate(
    conn: &Connection,
    request: &CaseMatchRequest,
    config: &MatcherConfig,
) -> Result<Vec<(i64, SignalContribution)>, String> {
    let names = candidate_names(request);
    if names.is_empty() {
        return Ok(Vec::new());
    }
    let parties = case_parties(conn)?;
    if parties.is_empty() {
        return Ok(Vec::new());
    }

    // Best match per case only: several parties of the same case matching is not stronger
    // evidence than one, and would otherwise let a case with many recorded parties win.
    let mut best_per_case: std::collections::BTreeMap<i64, (f64, String, String)> =
        std::collections::BTreeMap::new();

    for name in &names {
        for (case_id, party_norm, party_raw) in &parties {
            let score = name_similarity(name, party_norm);
            if score < SIMILARITY_FLOOR {
                continue;
            }
            let entry = best_per_case
                .entry(*case_id)
                .or_insert((0.0, String::new(), String::new()));
            if score > entry.0 {
                *entry = (score, name.clone(), party_raw.clone());
            }
        }
    }

    Ok(best_per_case
        .into_iter()
        .map(|(case_id, (score, email_name, party))| {
            // Rescale [floor, 1.0] onto [0, 1] so a bare-threshold match is not treated
            // as confidently as an exact one.
            let scaled = ((score - SIMILARITY_FLOOR) / (1.0 - SIMILARITY_FLOOR)).clamp(0.0, 1.0);
            (
                case_id,
                SignalContribution {
                    tier: "C",
                    name: "party_name",
                    raw: score,
                    weighted: scaled * config.weights.party_name,
                    detail: format!("\"{email_name}\" ≈ \"{party}\" ({score:.2})"),
                    // A shared surname is common; never enough on its own.
                    decisive: false,
                },
            )
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::emails_case_api::CaseMatchPhase;
    use crate::email::EmailExtractedSignals;
    use crate::store::matcher_schema::init_matcher_schema;
    use rusqlite::params;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, name TEXT);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, message_id TEXT);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY, message_id TEXT);",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();
        conn
    }

    fn party(conn: &Connection, case_id: i64, name: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO cases (id, name) VALUES (?1, 'c')",
            params![case_id],
        )
        .unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO case_identifiers
                (case_id, kind, value_norm, value_raw, source, weight, created_at)
             VALUES (?1, ?2, ?3, ?4, 'case_fields', 1.0, 'now')",
            params![case_id, ids::KIND_PARTY_NAME, normalize_for_match(name), name],
        )
        .unwrap();
    }

    fn request_from(sender_name: &str) -> CaseMatchRequest {
        CaseMatchRequest {
            message_id: "<m@x>".into(),
            sender: "a@b.com".into(),
            subject: String::new(),
            snippet: String::new(),
            body_text: String::new(),
            attachment_text: String::new(),
            in_reply_to: None,
            references: vec![],
            search_terms: vec![],
            deterministic: EmailExtractedSignals {
                sender_name: Some(sender_name.to_string()),
                ..Default::default()
            },
            classification: None,
            phase: CaseMatchPhase::AfterDeterministic,
        }
    }

    fn run(conn: &Connection, sender_name: &str) -> Vec<(i64, SignalContribution)> {
        evaluate(conn, &request_from(sender_name), &MatcherConfig::default()).unwrap()
    }

    #[test]
    fn matches_a_hyphenated_variant() {
        let conn = db();
        party(&conn, 1, "דוד מזרחי");
        let hits = run(&conn, "דוד מזרחי-כהן");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, 1);
    }

    #[test]
    fn matches_a_surname_only_record() {
        let conn = db();
        party(&conn, 1, "מזרחי");
        assert_eq!(run(&conn, "דוד מזרחי")[0].0, 1);
    }

    #[test]
    fn tolerates_a_latin_spelling_slip() {
        let conn = db();
        party(&conn, 1, "Moshe Levy");
        assert_eq!(run(&conn, "Moshe Levi")[0].0, 1);
    }

    #[test]
    fn different_people_do_not_match() {
        let conn = db();
        party(&conn, 1, "דוד מזרחי");
        assert!(run(&conn, "שרה פרץ").is_empty());
    }

    #[test]
    fn is_never_decisive() {
        let conn = db();
        party(&conn, 1, "דוד מזרחי");
        assert!(run(&conn, "דוד מזרחי").iter().all(|(_, s)| !s.decisive));
    }

    #[test]
    fn an_exact_match_outscores_a_borderline_one() {
        let conn = db();
        party(&conn, 1, "דוד מזרחי");
        party(&conn, 2, "דוד מזרחיאן");
        let hits = run(&conn, "דוד מזרחי");
        let exact = hits.iter().find(|(id, _)| *id == 1).unwrap();
        if let Some(other) = hits.iter().find(|(id, _)| *id == 2) {
            assert!(exact.1.weighted > other.1.weighted);
        }
    }

    #[test]
    fn several_parties_on_one_case_do_not_stack() {
        let conn = db();
        party(&conn, 1, "דוד מזרחי");
        party(&conn, 1, "דוד מזרחי כהן");
        let hits = run(&conn, "דוד מזרחי");
        assert_eq!(hits.len(), 1, "one contribution per case: {hits:?}");
    }

    #[test]
    fn very_short_names_are_ignored() {
        let conn = db();
        party(&conn, 1, "לוי");
        assert!(run(&conn, "לוי").is_empty(), "3-char names match too much");
    }

    #[test]
    fn no_parties_recorded_yields_nothing() {
        let conn = db();
        conn.execute("INSERT INTO cases (id, name) VALUES (1, 'c')", [])
            .unwrap();
        assert!(run(&conn, "דוד מזרחי").is_empty());
    }

    #[test]
    fn similarity_is_symmetric_enough_and_bounded() {
        assert!((name_similarity("דוד מזרחי", "דוד מזרחי") - 1.0).abs() < 1e-9);
        assert!(name_similarity("abc", "xyz") < SIMILARITY_FLOOR);
    }
}
