//! Mines identifiers out of case data into `case_identifiers`, the index Tier A looks
//! up (design §5.3).
//!
//! Mining is driven primarily by **field names**, not by scanning values. A real profile
//! (P0 / AMI-110) stores case data under compound `role:field:index` names —
//! `מאת:ת.ז:2`, `מקבל:שם מלא:1`, `גוש ספר:1` — which say precisely what a value *is*.
//! That is far more reliable than guessing from the value, and it yields the party role
//! for free. Regex scanning of values is kept as a backstop for free-text fields, reusing
//! the same extractor the email pipeline runs so both sides of a match agree.

use rusqlite::{params, Connection};
use std::collections::BTreeMap;

use crate::email::{
    land_registry_key, normalize_case_number, normalize_digits, normalize_email, normalize_for_match,
};

pub const KIND_CASE_NUMBER: &str = "case_number";
pub const KIND_LAND_REGISTRY: &str = "land_registry";
pub const KIND_DEED: &str = "deed";
pub const KIND_EMAIL: &str = "email";
pub const KIND_PHONE: &str = "phone";
pub const KIND_NATIONAL_ID: &str = "national_id";
pub const KIND_COMPANY_ID: &str = "company_id";
pub const KIND_PARTY_NAME: &str = "party_name";
pub const KIND_FOLDER_TOKEN: &str = "folder_token";
pub const KIND_THREAD_REF: &str = "thread_ref";

pub const SOURCE_FIELDS: &str = "case_fields";
pub const SOURCE_SUBJECT: &str = "case_subject";
pub const SOURCE_NAME: &str = "case_name";
pub const SOURCE_NOTES: &str = "case_notes";
pub const SOURCE_FOLDER: &str = "folder";
pub const SOURCE_CONFIRMED: &str = "confirmed_email";
pub const SOURCE_MANUAL: &str = "manual";

#[derive(Debug, Clone, PartialEq)]
pub struct MinedIdentifier {
    pub kind: String,
    pub role: Option<String>,
    pub value_norm: String,
    pub value_raw: String,
    pub source: String,
    pub weight: f64,
}

impl MinedIdentifier {
    fn new(kind: &str, value_norm: String, value_raw: &str, source: &str, weight: f64) -> Self {
        Self {
            kind: kind.to_string(),
            role: None,
            value_norm,
            value_raw: value_raw.to_string(),
            source: source.to_string(),
            weight,
        }
    }
    fn with_role(mut self, role: Option<String>) -> Self {
        self.role = role;
        self
    }
}

// ── Compound field names ─────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedFieldName {
    pub role: Option<String>,
    pub field: String,
    pub index: Option<u32>,
}

/// Split `role:field:index` into parts. All three shapes occur in real data:
/// `מאת:ת.ז:2` (all three), `גוש ספר:1` (field + index), `שטר` (field only).
pub fn parse_field_name(name: &str) -> ParsedFieldName {
    let mut parts: Vec<&str> = name.split(':').map(|p| p.trim()).collect();

    let index = match parts.last() {
        Some(last) if !last.is_empty() && last.chars().all(|c| c.is_ascii_digit()) => {
            let idx = last.parse::<u32>().ok();
            parts.pop();
            idx
        }
        _ => None,
    };

    match parts.len() {
        0 => ParsedFieldName {
            role: None,
            field: String::new(),
            index,
        },
        1 => ParsedFieldName {
            role: None,
            field: parts[0].to_string(),
            index,
        },
        _ => ParsedFieldName {
            role: Some(parts[0].to_string()),
            field: parts[1..].join(":"),
            index,
        },
    }
}

/// Land-registry components are only meaningful assembled, so they are detected
/// separately from other kinds.
#[derive(Debug, Clone, Copy, PartialEq)]
enum PlotPart {
    Gush,
    Helka,
    Tat,
}

fn plot_part_for(field: &str) -> Option<PlotPart> {
    let f = normalize_for_match(field);
    // Needles are normalized too: `normalize_for_match` folds Hebrew final forms, so a
    // raw literal like "שם מלא" (final ם) never matches the folded text "שמ מלא".
    let has = |needle: &str| f.contains(&normalize_for_match(needle));
    // Order matters: "תת חלקה" also contains "חלקה".
    if has("תת חלקה") {
        Some(PlotPart::Tat)
    } else if has("גוש") {
        Some(PlotPart::Gush)
    } else if has("חלקה") {
        Some(PlotPart::Helka)
    } else {
        None
    }
}

/// Map a field name to an identifier kind. Returns `None` for fields that carry no
/// identifier (dates, free text, registry bureau, …).
fn kind_for_field(field: &str) -> Option<(&'static str, f64)> {
    let f = normalize_for_match(field);
    let has = |needle: &str| f.contains(&normalize_for_match(needle));

    if has("שטר") {
        return Some((KIND_DEED, 1.0));
    }
    // `ת.ז` normalizes to "ת ז"; also accept the run-together spelling.
    if has("ת ז") || has("תז") || has("תעודת זהות") {
        return Some((KIND_NATIONAL_ID, 1.0));
    }
    if has("ח פ") || has("ח צ") || has("חפ") || has("עוסק מורשה") {
        return Some((KIND_COMPANY_ID, 1.0));
    }
    if (has("תיק") || has("case"))
        && (has("מספר") || has("number") || has("no"))
    {
        return Some((KIND_CASE_NUMBER, 1.0));
    }
    if has("שם מלא") || has("שם פרטי") || has("שם משפחה") || has("בעלים")
    {
        return Some((KIND_PARTY_NAME, 0.9));
    }
    if has("טלפון") || has("נייד") || has("phone") || has("פקס") {
        return Some((KIND_PHONE, 0.9));
    }
    if has("מייל") || has("דואל") || has("email") || has("דוא ל") {
        return Some((KIND_EMAIL, 0.9));
    }
    None
}

// ── Mining ───────────────────────────────────────────────────────────────────

/// Value-scan free text with the *same* extractor the email pipeline uses, so a value
/// and an email body normalize to the same key.
fn mine_text(text: &str, source: &str, weight: f64) -> Vec<MinedIdentifier> {
    if text.trim().is_empty() {
        return Vec::new();
    }
    let signals = crate::email::extract_email_signals("", "", text);
    let mut out = Vec::new();

    for v in &signals.case_numbers {
        if let Some(norm) = normalize_case_number(v) {
            out.push(MinedIdentifier::new(KIND_CASE_NUMBER, norm, v, source, weight));
        }
    }
    for v in &signals.party_names {
        out.push(MinedIdentifier::new(
            KIND_PARTY_NAME,
            normalize_for_match(v),
            v,
            source,
            weight * 0.9,
        ));
    }
    for v in &signals.emails {
        out.push(MinedIdentifier::new(
            KIND_EMAIL,
            normalize_email(v),
            v,
            source,
            weight,
        ));
    }
    for v in &signals.phone_numbers {
        out.push(MinedIdentifier::new(
            KIND_PHONE,
            normalize_digits(v),
            v,
            source,
            weight * 0.9,
        ));
    }
    for v in &signals.national_ids {
        out.push(MinedIdentifier::new(
            KIND_NATIONAL_ID,
            normalize_digits(v),
            v,
            source,
            weight,
        ));
    }
    for v in &signals.company_ids {
        out.push(MinedIdentifier::new(
            KIND_COMPANY_ID,
            normalize_digits(v),
            v,
            source,
            weight,
        ));
    }
    out
}

/// Mine `case_fields`, driven by field names with a value-scan backstop.
pub fn mine_case_fields(fields: &[(String, String)]) -> Vec<MinedIdentifier> {
    let mut out = Vec::new();
    // index → (gush, helka, tat); grouped so components written as separate fields
    // assemble into one composite key.
    let mut plots: BTreeMap<u32, (Option<String>, Option<String>, Option<String>)> = BTreeMap::new();

    for (name, value) in fields {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        let parsed = parse_field_name(name);

        if let Some(part) = plot_part_for(&parsed.field) {
            let entry = plots.entry(parsed.index.unwrap_or(1)).or_default();
            match part {
                PlotPart::Gush => entry.0 = Some(value.to_string()),
                PlotPart::Helka => entry.1 = Some(value.to_string()),
                PlotPart::Tat => entry.2 = Some(value.to_string()),
            }
            continue;
        }

        if let Some((kind, weight)) = kind_for_field(&parsed.field) {
            let norm = match kind {
                KIND_CASE_NUMBER => match normalize_case_number(value) {
                    Some(n) => n,
                    None => continue,
                },
                KIND_EMAIL => normalize_email(value),
                KIND_NATIONAL_ID | KIND_COMPANY_ID | KIND_PHONE | KIND_DEED => {
                    let digits = normalize_digits(value);
                    if digits.is_empty() {
                        continue;
                    }
                    digits
                }
                _ => {
                    let n = normalize_for_match(value);
                    if n.is_empty() {
                        continue;
                    }
                    n
                }
            };
            out.push(
                MinedIdentifier::new(kind, norm, value, SOURCE_FIELDS, weight)
                    .with_role(parsed.role.clone()),
            );
            continue;
        }

        // Unrecognised field name — fall back to scanning the value.
        out.extend(mine_text(value, SOURCE_FIELDS, 0.8));
    }

    for (_, (gush, helka, tat)) in plots {
        // A gush alone spans many properties and must never identify a matter, so only
        // composites of at least gush+helka are indexed (design §5.5 A2/A4).
        if let (Some(g), Some(h)) = (gush.as_ref(), helka.as_ref()) {
            if let Some(key) = land_registry_key(g, h, tat.as_deref()) {
                let raw = match &tat {
                    Some(t) => format!("גוש {g} חלקה {h} תת חלקה {t}"),
                    None => format!("גוש {g} חלקה {h}"),
                };
                out.push(MinedIdentifier::new(
                    KIND_LAND_REGISTRY,
                    key,
                    &raw,
                    SOURCE_FIELDS,
                    1.0,
                ));
            }
        }
    }

    out
}

/// Tokens from the case folder's basename — weak, but the only signal for cases whose
/// metadata is otherwise empty.
pub fn mine_folder(folder: &str) -> Vec<MinedIdentifier> {
    let base = folder
        .replace('\\', "/")
        .rsplit('/')
        .find(|s| !s.is_empty())
        .unwrap_or("")
        .to_string();
    if base.is_empty() {
        return Vec::new();
    }
    base.split(['-', '_', ' '])
        .filter(|t| t.chars().count() >= 3)
        .map(|t| {
            MinedIdentifier::new(
                KIND_FOLDER_TOKEN,
                normalize_for_match(t),
                t,
                SOURCE_FOLDER,
                0.5,
            )
        })
        .filter(|m| !m.value_norm.is_empty())
        .collect()
}

fn dedupe(mut items: Vec<MinedIdentifier>) -> Vec<MinedIdentifier> {
    // Highest weight wins for a given (kind, value); the unique DB index enforces the
    // same rule, this just keeps the in-memory result honest and testable.
    items.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then(a.value_norm.cmp(&b.value_norm))
            .then(b.weight.partial_cmp(&a.weight).unwrap_or(std::cmp::Ordering::Equal))
    });
    items.dedup_by(|a, b| a.kind == b.kind && a.value_norm == b.value_norm);
    items
}

/// Everything mineable for one case, from all sources.
pub fn mine_case(
    subject: Option<&str>,
    name: Option<&str>,
    folder: Option<&str>,
    notes: Option<&str>,
    fields: &[(String, String)],
) -> Vec<MinedIdentifier> {
    let mut out = Vec::new();
    out.extend(mine_case_fields(fields));
    if let Some(s) = subject {
        out.extend(mine_text(s, SOURCE_SUBJECT, 0.9));
    }
    if let Some(n) = name {
        let norm = normalize_for_match(n);
        if !norm.is_empty() {
            out.push(MinedIdentifier::new(KIND_PARTY_NAME, norm, n, SOURCE_NAME, 0.9));
        }
        out.extend(mine_text(n, SOURCE_NAME, 0.9));
    }
    if let Some(notes) = notes {
        out.extend(mine_text(notes, SOURCE_NOTES, 0.6));
    }
    if let Some(f) = folder {
        out.extend(mine_folder(f));
    }
    dedupe(out)
}

// ── Persistence ──────────────────────────────────────────────────────────────

fn insert_identifiers(
    conn: &Connection,
    case_id: i64,
    items: &[MinedIdentifier],
) -> Result<usize, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut inserted = 0;
    let mut stmt = conn
        .prepare(
            "INSERT OR IGNORE INTO case_identifiers
                (case_id, kind, role, value_norm, value_raw, source, weight, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .map_err(|e| e.to_string())?;

    for item in items {
        inserted += stmt
            .execute(params![
                case_id,
                item.kind,
                item.role,
                item.value_norm,
                item.value_raw,
                item.source,
                item.weight,
                now,
            ])
            .map_err(|e| format!("[case_identifiers insert] {e}"))?;
    }
    Ok(inserted)
}

fn load_case_row(
    conn: &Connection,
    case_id: i64,
) -> Result<(Option<String>, Option<String>, Option<String>), String> {
    conn.query_row(
        "SELECT subject, name, folder FROM cases WHERE id = ?1",
        params![case_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(|e| format!("[case {case_id} not found] {e}"))
}

fn load_case_fields(conn: &Connection, case_id: i64) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT field_name, field_value FROM case_fields WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![case_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default()))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

fn load_case_notes(conn: &Connection, case_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT notes FROM case_annotations WHERE case_id = ?1",
        params![case_id],
        |r| r.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

/// Rebuild the derived identifiers for one case.
///
/// Identifiers learned from confirmed email, and any added manually, are **preserved** —
/// they are not derivable from case metadata, so a rebuild must not discard them.
pub fn rebuild_case_identifiers(conn: &Connection, case_id: i64) -> Result<usize, String> {
    conn.execute(
        "DELETE FROM case_identifiers WHERE case_id = ?1 AND source NOT IN (?2, ?3)",
        params![case_id, SOURCE_CONFIRMED, SOURCE_MANUAL],
    )
    .map_err(|e| format!("[case_identifiers clear] {e}"))?;

    let (subject, name, folder) = load_case_row(conn, case_id)?;
    let fields = load_case_fields(conn, case_id)?;
    let notes = load_case_notes(conn, case_id);

    let mined = mine_case(
        subject.as_deref(),
        name.as_deref(),
        folder.as_deref(),
        notes.as_deref(),
        &fields,
    );
    insert_identifiers(conn, case_id, &mined)
}

pub fn rebuild_all_case_identifiers(conn: &Connection) -> Result<usize, String> {
    let ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM cases WHERE deleted = 0 OR deleted IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    let mut total = 0;
    for id in ids {
        total += rebuild_case_identifiers(conn, id)?;
    }
    Ok(total)
}

/// Record what a confirmed email teaches: the sender now belongs to this case, and the
/// message id anchors future replies. This is the feedback edge that closes the
/// cold-start gap — these identifiers survive rebuilds.
pub fn learn_from_confirmed_email(
    conn: &Connection,
    case_id: i64,
    sender: &str,
    message_id: &str,
) -> Result<usize, String> {
    let mut items = Vec::new();

    let sender_norm = normalize_email(sender);
    if !sender_norm.is_empty() {
        items.push(MinedIdentifier::new(
            KIND_EMAIL,
            sender_norm,
            sender,
            SOURCE_CONFIRMED,
            1.0,
        ));
    }
    let mid = message_id.trim().trim_matches(|c| c == '<' || c == '>');
    if !mid.is_empty() {
        items.push(MinedIdentifier::new(
            KIND_THREAD_REF,
            mid.to_lowercase(),
            message_id,
            SOURCE_CONFIRMED,
            1.0,
        ));
    }
    insert_identifiers(conn, case_id, &items)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(name: &str, value: &str) -> (String, String) {
        (name.to_string(), value.to_string())
    }

    #[test]
    fn parses_compound_field_names() {
        assert_eq!(
            parse_field_name("מאת:ת.ז:2"),
            ParsedFieldName {
                role: Some("מאת".into()),
                field: "ת.ז".into(),
                index: Some(2)
            }
        );
        assert_eq!(
            parse_field_name("גוש ספר:1"),
            ParsedFieldName {
                role: None,
                field: "גוש ספר".into(),
                index: Some(1)
            }
        );
        assert_eq!(
            parse_field_name("שטר"),
            ParsedFieldName {
                role: None,
                field: "שטר".into(),
                index: None
            }
        );
    }

    #[test]
    fn assembles_land_registry_from_separate_fields() {
        let mined = mine_case_fields(&[
            f("גוש ספר:1", "972"),
            f("חלקה דף:1", "11"),
            f("תת חלקה:1", "33"),
        ]);
        let lr: Vec<_> = mined.iter().filter(|m| m.kind == KIND_LAND_REGISTRY).collect();
        assert_eq!(lr.len(), 1);
        assert_eq!(lr[0].value_norm, "972/11/33");
    }

    #[test]
    fn land_registry_without_sub_parcel_is_still_indexed() {
        let mined = mine_case_fields(&[f("גוש ספר:1", "972"), f("חלקה דף:1", "11")]);
        assert!(mined.iter().any(|m| m.value_norm == "972/11"));
    }

    #[test]
    fn gush_alone_is_never_indexed() {
        let mined = mine_case_fields(&[f("גוש ספר:1", "972")]);
        assert!(
            !mined.iter().any(|m| m.kind == KIND_LAND_REGISTRY),
            "a gush alone spans many properties and must not identify a case"
        );
    }

    #[test]
    fn separate_plots_do_not_bleed_across_indices() {
        let mined = mine_case_fields(&[
            f("גוש ספר:1", "972"),
            f("חלקה דף:1", "11"),
            f("גוש ספר:2", "500"),
            f("חלקה דף:2", "80"),
        ]);
        let keys: Vec<&str> = mined
            .iter()
            .filter(|m| m.kind == KIND_LAND_REGISTRY)
            .map(|m| m.value_norm.as_str())
            .collect();
        assert!(keys.contains(&"972/11"));
        assert!(keys.contains(&"500/80"));
        assert!(!keys.contains(&"972/80"), "components crossed between plots");
    }

    #[test]
    fn national_ids_keep_their_role() {
        let mined = mine_case_fields(&[f("מאת:ת.ז:1", "123456782"), f("מקבל:ת.ז:1", "987654321")]);
        let ids: Vec<_> = mined.iter().filter(|m| m.kind == KIND_NATIONAL_ID).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.iter().any(|m| m.role.as_deref() == Some("מאת")));
        assert!(ids.iter().any(|m| m.role.as_deref() == Some("מקבל")));
    }

    #[test]
    fn party_names_are_mined_with_role() {
        let mined = mine_case_fields(&[f("מקבל:שם מלא:1", "דוד כהן")]);
        let p = mined.iter().find(|m| m.kind == KIND_PARTY_NAME).unwrap();
        assert_eq!(p.role.as_deref(), Some("מקבל"));
        assert_eq!(p.value_norm, normalize_for_match("דוד כהן"));
    }

    #[test]
    fn deed_and_case_number_normalise() {
        let mined = mine_case_fields(&[f("שטר", "4471"), f("מספר תיק", "12345/23")]);
        assert!(mined
            .iter()
            .any(|m| m.kind == KIND_DEED && m.value_norm == "4471"));
        assert!(mined
            .iter()
            .any(|m| m.kind == KIND_CASE_NUMBER && m.value_norm == "12345/23"));
    }

    #[test]
    fn unrecognised_fields_fall_back_to_value_scanning() {
        // "הערות" maps to no kind, so the email inside must still be found.
        let mined = mine_case_fields(&[f("הערות", "ליצירת קשר: adv@lawfirm.co.il")]);
        assert!(mined
            .iter()
            .any(|m| m.kind == KIND_EMAIL && m.value_norm.contains("adv@lawfirm.co.il")));
    }

    #[test]
    fn empty_values_are_skipped() {
        let mined = mine_case_fields(&[f("מספר תיק", "   "), f("שטר", "")]);
        assert!(mined.is_empty());
    }

    #[test]
    fn folder_tokens_are_mined_and_short_ones_dropped() {
        let mined = mine_folder("/home/x/cases/מכירת-דירה-בנאמנות");
        assert!(!mined.is_empty());
        assert!(mined.iter().all(|m| m.kind == KIND_FOLDER_TOKEN));
        assert!(mined.iter().all(|m| m.value_norm.chars().count() >= 3));
    }

    #[test]
    fn conveyancing_case_yields_no_case_number() {
        let mined = mine_case(
            Some("מכירת דירה בנאמנות"),
            Some("דורון מזרחי"),
            Some("/tmp/cases/case-1"),
            None,
            &[
                f("גוש ספר:1", "972"),
                f("חלקה דף:1", "11"),
                f("מאת:ת.ז:1", "123456782"),
            ],
        );
        assert!(!mined.iter().any(|m| m.kind == KIND_CASE_NUMBER));
        assert!(mined.iter().any(|m| m.kind == KIND_LAND_REGISTRY));
        assert!(mined.iter().any(|m| m.kind == KIND_NATIONAL_ID));
    }

    #[test]
    fn dedupe_keeps_the_highest_weight() {
        let items = vec![
            MinedIdentifier::new(KIND_EMAIL, "a@b.com".into(), "a@b.com", SOURCE_NOTES, 0.6),
            MinedIdentifier::new(KIND_EMAIL, "a@b.com".into(), "a@b.com", SOURCE_FIELDS, 1.0),
        ];
        let out = dedupe(items);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].weight, 1.0);
    }
}
