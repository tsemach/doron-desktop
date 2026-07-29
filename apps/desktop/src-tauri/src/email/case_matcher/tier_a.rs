//! Tier A — hard identifier lookups (design §5.5).
//!
//! Organised by identifier *precision*, not practice area. Ascurix serves both
//! litigation and conveyancing, and the two key a matter completely differently: a
//! litigation case by court case number, a conveyancing matter by land-registry
//! coordinates and party national IDs, with no case number at all (AMI-110). A case only
//! needs to carry one family.
//!
//! Every lookup is an indexed exact match on `case_identifiers.value_norm`, which is why
//! both sides normalize through the same functions.

use rusqlite::{params, Connection};

use crate::case::identifiers as ids;
use crate::email::emails_case_api::CaseMatchRequest;
use crate::email::{land_registry_prefixes, normalize_digits, normalize_email};

use super::config::MatcherConfig;
use super::scoring::SignalContribution;

/// A signal that settles the match on its own — but only when it resolves to exactly one
/// case. Several cases sharing a national ID (one client, several matters) or a parcel
/// (sold twice) must fall through to Tiers B/C instead of early-exiting.
fn contribution(
    name: &'static str,
    raw: f64,
    weight: f64,
    detail: String,
    decisive: bool,
) -> SignalContribution {
    SignalContribution {
        tier: "A",
        name,
        raw,
        weighted: raw * weight,
        detail,
        decisive,
    }
}

/// Cases carrying `value_norm` for one of `kinds`.
fn lookup(conn: &Connection, kinds: &[&str], value: &str) -> Result<Vec<i64>, String> {
    if value.trim().is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = kinds.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT DISTINCT case_id FROM case_identifiers
         WHERE kind IN ({placeholders}) AND value_norm = ?"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut args: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(kinds.len() + 1);
    for k in kinds {
        args.push(k);
    }
    args.push(&value);

    let rows = stmt
        .query_map(args.as_slice(), |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

/// A0 — the email replies to a message already linked to a case.
fn thread_refs(conn: &Connection, request: &CaseMatchRequest) -> Result<Vec<i64>, String> {
    let mut refs: Vec<String> = Vec::new();
    if let Some(parent) = &request.in_reply_to {
        refs.push(parent.clone());
    }
    refs.extend(request.references.iter().cloned());

    let mut cases = Vec::new();
    for raw in refs {
        let trimmed = raw.trim().trim_matches(|c| c == '<' || c == '>');
        if trimmed.is_empty() {
            continue;
        }
        // Both spellings are stored in the wild, so match with and without brackets.
        let bracketed = format!("<{trimmed}>");
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT case_id FROM case_emails
                 WHERE message_id = ?1 OR message_id = ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![trimmed, bracketed], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        cases.extend(rows.flatten());

        cases.extend(lookup(conn, &[ids::KIND_THREAD_REF], &trimmed.to_lowercase())?);
    }
    cases.sort_unstable();
    cases.dedup();
    Ok(cases)
}

/// Evaluate every Tier A signal, returning per-case contributions.
pub fn evaluate(
    conn: &Connection,
    request: &CaseMatchRequest,
    config: &MatcherConfig,
) -> Result<Vec<(i64, SignalContribution)>, String> {
    let w = &config.weights;
    let mut out: Vec<(i64, SignalContribution)> = Vec::new();

    // Helper: record one signal against every case it resolved to. `decisive_kind` only
    // takes effect when exactly one case matched.
    let push = |cases: Vec<i64>,
                    name: &'static str,
                    weight: f64,
                    detail: String,
                    decisive_kind: bool,
                    out: &mut Vec<(i64, SignalContribution)>| {
        let unique = cases.len() == 1;
        for case_id in cases {
            out.push((
                case_id,
                contribution(name, 1.0, weight, detail.clone(), decisive_kind && unique),
            ));
        }
    };

    // A0 — thread reference.
    let threads = thread_refs(conn, request)?;
    push(
        threads,
        "thread_ref",
        w.thread_ref,
        "reply to a message already linked to this case".to_string(),
        true,
        &mut out,
    );

    let signals = &request.deterministic;

    // A1 — court case number.
    for value in &signals.case_numbers {
        let cases = lookup(conn, &[ids::KIND_CASE_NUMBER], value)?;
        push(
            cases,
            "case_number",
            w.case_number,
            format!("case number {value}"),
            true,
            &mut out,
        );
    }

    // A2/A4 — land registry, longest prefix first. A full gush/helka/tat identifies a
    // unit and is decisive; gush/helka identifies a parcel and is not.
    for key in &signals.land_registry {
        for (depth, candidate) in land_registry_prefixes(key).into_iter().enumerate() {
            let cases = lookup(conn, &[ids::KIND_LAND_REGISTRY], &candidate)?;
            if cases.is_empty() {
                continue;
            }
            let full = candidate.matches('/').count() >= 2;
            push(
                cases,
                if full {
                    "land_registry"
                } else {
                    "land_registry_partial"
                },
                if full {
                    w.land_registry
                } else {
                    w.land_registry_partial
                },
                format!("land registry {candidate}"),
                full,
                &mut out,
            );
            let _ = depth;
            // Stop at the most specific match; a parcel-level hit adds nothing once the
            // unit-level one is found.
            break;
        }
    }

    // A3 — deed number.
    for value in &signals.deeds {
        let cases = lookup(conn, &[ids::KIND_DEED], &normalize_digits(value))?;
        push(
            cases,
            "deed",
            w.deed,
            format!("deed {value}"),
            true,
            &mut out,
        );
    }

    // A5 — national / company ID. Decisive only when it resolves to one case: a client
    // legitimately has several matters.
    for value in &signals.national_ids {
        let cases = lookup(conn, &[ids::KIND_NATIONAL_ID], &normalize_digits(value))?;
        push(
            cases,
            "national_id",
            w.national_id,
            format!("national id {value}"),
            true,
            &mut out,
        );
    }
    for value in &signals.company_ids {
        let cases = lookup(conn, &[ids::KIND_COMPANY_ID], &normalize_digits(value))?;
        push(
            cases,
            "company_id",
            w.company_id,
            format!("company id {value}"),
            true,
            &mut out,
        );
    }

    // A6/A7 — sender address. Never decisive: opposing counsel emails about many matters,
    // so this is a prior that content similarity has to confirm.
    if let Some(sender) = signals.sender_email.as_deref() {
        let normalized = normalize_email(sender);
        let confirmed = {
            let mut stmt = conn
                .prepare(
                    "SELECT DISTINCT case_id FROM case_identifiers
                     WHERE kind = ?1 AND value_norm = ?2 AND source = ?3",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(
                    params![ids::KIND_EMAIL, normalized, ids::SOURCE_CONFIRMED],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?;
            rows.flatten().collect::<Vec<i64>>()
        };

        if !confirmed.is_empty() {
            push(
                confirmed,
                "sender_confirmed",
                w.sender_confirmed,
                format!("{sender} previously confirmed on this case"),
                false,
                &mut out,
            );
        } else {
            let known = lookup(conn, &[ids::KIND_EMAIL], &normalized)?;
            push(
                known,
                "sender_metadata",
                w.sender_metadata,
                format!("{sender} appears in this case's details"),
                false,
                &mut out,
            );
        }
    }

    // A8 — phone number.
    for value in &signals.phone_numbers {
        let cases = lookup(conn, &[ids::KIND_PHONE], &normalize_digits(value))?;
        push(
            cases,
            "phone",
            w.phone,
            format!("phone {value}"),
            false,
            &mut out,
        );
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::emails_case_api::CaseMatchPhase;
    use crate::email::EmailExtractedSignals;
    use crate::store::matcher_schema::init_matcher_schema;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, case_id INTEGER, message_id TEXT);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY, message_id TEXT);",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();
        conn
    }

    fn add_identifier(conn: &Connection, case_id: i64, kind: &str, value: &str, source: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO cases (id, name) VALUES (?1, 'case')",
            params![case_id],
        )
        .unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO case_identifiers
                (case_id, kind, value_norm, value_raw, source, weight, created_at)
             VALUES (?1, ?2, ?3, ?3, ?4, 1.0, 'now')",
            params![case_id, kind, value, source],
        )
        .unwrap();
    }

    fn request(signals: EmailExtractedSignals) -> CaseMatchRequest {
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
            deterministic: signals,
            classification: None,
            phase: CaseMatchPhase::AfterDeterministic,
        }
    }

    fn run(conn: &Connection, req: &CaseMatchRequest) -> Vec<(i64, SignalContribution)> {
        evaluate(conn, req, &MatcherConfig::default()).unwrap()
    }

    #[test]
    fn case_number_is_decisive_when_unique() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_CASE_NUMBER, "12345/23", ids::SOURCE_FIELDS);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                case_numbers: vec!["12345/23".into()],
                ..Default::default()
            }),
        );
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, 1);
        assert!(hits[0].1.decisive);
    }

    /// Court case numbers are not globally unique across courts, so a collision must not
    /// early-exit onto an arbitrary case.
    #[test]
    fn shared_case_number_is_not_decisive() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_CASE_NUMBER, "12345/23", ids::SOURCE_FIELDS);
        add_identifier(&conn, 2, ids::KIND_CASE_NUMBER, "12345/23", ids::SOURCE_FIELDS);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                case_numbers: vec!["12345/23".into()],
                ..Default::default()
            }),
        );
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().all(|(_, s)| !s.decisive));
    }

    #[test]
    fn full_land_registry_is_decisive_partial_is_not() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_LAND_REGISTRY, "972/11/33", ids::SOURCE_FIELDS);
        add_identifier(&conn, 2, ids::KIND_LAND_REGISTRY, "500/80", ids::SOURCE_FIELDS);

        let full = run(
            &conn,
            &request(EmailExtractedSignals {
                land_registry: vec!["972/11/33".into()],
                ..Default::default()
            }),
        );
        assert_eq!(full[0].1.name, "land_registry");
        assert!(full[0].1.decisive);

        let partial = run(
            &conn,
            &request(EmailExtractedSignals {
                land_registry: vec!["500/80".into()],
                ..Default::default()
            }),
        );
        assert_eq!(partial[0].1.name, "land_registry_partial");
        assert!(
            !partial[0].1.decisive,
            "a parcel without a sub-parcel must not settle the match"
        );
    }

    #[test]
    fn land_registry_falls_back_to_the_parcel_when_the_unit_is_unknown() {
        let conn = db();
        // The case knows only the parcel; the email cites the full unit.
        add_identifier(&conn, 3, ids::KIND_LAND_REGISTRY, "972/11", ids::SOURCE_FIELDS);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                land_registry: vec!["972/11/33".into()],
                ..Default::default()
            }),
        );
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, 3);
        assert_eq!(hits[0].1.name, "land_registry_partial");
    }

    #[test]
    fn near_miss_parcel_matches_nothing() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_LAND_REGISTRY, "972/11", ids::SOURCE_FIELDS);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                land_registry: vec!["972/40".into()], // same block, different parcel
                ..Default::default()
            }),
        );
        assert!(hits.is_empty(), "a decoy near-miss must not match");
    }

    #[test]
    fn national_id_across_two_matters_is_not_decisive() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_NATIONAL_ID, "123456782", ids::SOURCE_FIELDS);
        add_identifier(&conn, 2, ids::KIND_NATIONAL_ID, "123456782", ids::SOURCE_FIELDS);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                national_ids: vec!["123456782".into()],
                ..Default::default()
            }),
        );
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().all(|(_, s)| !s.decisive));
    }

    #[test]
    fn sender_is_never_decisive() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_EMAIL, "adv@lawfirm.co.il", ids::SOURCE_CONFIRMED);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                sender_email: Some("adv@lawfirm.co.il".into()),
                ..Default::default()
            }),
        );
        assert_eq!(hits[0].1.name, "sender_confirmed");
        assert!(
            !hits[0].1.decisive,
            "opposing counsel emails about many matters"
        );
    }

    #[test]
    fn confirmed_sender_outweighs_a_metadata_sender() {
        let conn = db();
        add_identifier(&conn, 1, ids::KIND_EMAIL, "x@y.com", ids::SOURCE_CONFIRMED);
        let confirmed = run(
            &conn,
            &request(EmailExtractedSignals {
                sender_email: Some("x@y.com".into()),
                ..Default::default()
            }),
        );

        let conn2 = db();
        add_identifier(&conn2, 1, ids::KIND_EMAIL, "x@y.com", ids::SOURCE_FIELDS);
        let metadata = run(
            &conn2,
            &request(EmailExtractedSignals {
                sender_email: Some("x@y.com".into()),
                ..Default::default()
            }),
        );
        assert!(confirmed[0].1.weighted > metadata[0].1.weighted);
    }

    #[test]
    fn thread_reference_matches_a_linked_email() {
        let conn = db();
        conn.execute(
            "INSERT INTO case_emails (case_id, message_id) VALUES (5, '<prev@corpus.test>')",
            [],
        )
        .unwrap();
        let mut req = request(EmailExtractedSignals::default());
        req.in_reply_to = Some("<prev@corpus.test>".into());

        let hits = run(&conn, &req);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, 5);
        assert!(hits[0].1.decisive);
    }

    #[test]
    fn thread_reference_tolerates_missing_brackets() {
        let conn = db();
        conn.execute(
            "INSERT INTO case_emails (case_id, message_id) VALUES (5, 'prev@corpus.test')",
            [],
        )
        .unwrap();
        let mut req = request(EmailExtractedSignals::default());
        req.references = vec!["<prev@corpus.test>".into()];
        assert_eq!(run(&conn, &req)[0].0, 5);
    }

    #[test]
    fn unknown_identifiers_produce_nothing() {
        let conn = db();
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                case_numbers: vec!["99999/99".into()],
                national_ids: vec!["000000000".into()],
                ..Default::default()
            }),
        );
        assert!(hits.is_empty());
    }

    #[test]
    fn deed_matches_on_digits_only() {
        let conn = db();
        add_identifier(&conn, 4, ids::KIND_DEED, "4471", ids::SOURCE_FIELDS);
        let hits = run(
            &conn,
            &request(EmailExtractedSignals {
                deeds: vec!["4471".into()],
                ..Default::default()
            }),
        );
        assert_eq!(hits[0].0, 4);
        assert!(hits[0].1.decisive);
    }
}
