//! Tier B — content similarity (design §5.5).
//!
//! Matches emails that carry no hard identifier, by asking which case *reads like* this
//! email. Two sources: the case's own metadata (`case_text_fts`) and the text of the
//! documents filed under it (`documents_fts`, filtered by `documents.case_id`).
//!
//! **Scoring is IDF-weighted term coverage, not raw BM25.** SQLite's `bm25()` returns a
//! negative score whose magnitude varies with query length and corpus size, so turning it
//! into a 0..1 confidence means normalizing against the result set — and that makes the
//! best candidate score ~1.0 even when every candidate is poor. For a matcher that must
//! decline unrelated mail, an *absolute* signal matters more than a relative ranking, so
//! a case scores by how much of the query's information content it actually contains.
//! Rare terms count for more, which is the part of BM25 worth keeping.

use rusqlite::{params, Connection};
use std::collections::{BTreeMap, HashMap, HashSet};

use crate::email::emails_case_api::CaseMatchRequest;
use crate::email::strip_clitic_prefix;

use super::config::MatcherConfig;
use super::scoring::SignalContribution;

/// Hebrew and English function words. These appear in nearly every email and would
/// otherwise dominate coverage while carrying no information about *which* case.
const STOP_WORDS: &[&str] = &[
    "של", "את", "עם", "על", "לגבי", "בעניין", "בנוגע", "שלום", "תודה", "בברכה", "אשמח",
    "רציתי", "נא", "אני", "אנחנו", "הוא", "היא", "זה", "זו", "יש", "אין", "כל", "גם",
    "אבל", "או", "כי", "אם", "לא", "כן", "מה", "מי", "היי", "בהמשך", "מצורף", "הקדם",
    "the", "and", "for", "with", "this", "that", "you", "your", "our", "regarding",
    "hello", "thanks", "regards", "please", "from", "have", "has", "are", "was", "were",
];

fn is_stop_word(token: &str) -> bool {
    STOP_WORDS.iter().any(|w| *w == token)
}

/// Escape a term for an FTS5 MATCH expression.
fn fts_term(term: &str) -> String {
    format!("\"{}\"", term.replace('"', "\"\""))
}

/// Split text the way `unicode61` does — on everything that is not a letter or digit.
///
/// Deliberately *not* [`crate::email::normalize_for_match`]: both indexes Tier B queries
/// (`case_text_fts`, `documents_fts`) hold raw text, so a folded query term like `מחסנ`
/// can never reach the indexed `מחסן`. Tier A can normalize because it compares against
/// `case_identifiers.value_norm`, which is normalized on the way in; here the index is the
/// authority and the query has to speak its language. Only case is folded, for Latin.
fn tokenize(raw: &str) -> impl Iterator<Item = String> + '_ {
    raw.split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_lowercase())
}

/// Build the query terms: the deterministic search terms first, then salient tokens from
/// the email's own text.
fn query_terms(request: &CaseMatchRequest, config: &MatcherConfig) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut terms: Vec<String> = Vec::new();

    let push = |raw: &str, terms: &mut Vec<String>, seen: &mut HashSet<String>| {
        for token in tokenize(raw) {
            if token.chars().count() < 3 || is_stop_word(&token) {
                continue;
            }
            if seen.insert(token.clone()) {
                terms.push(token);
            }
        }
    };

    for term in &request.search_terms {
        push(term, &mut terms, &mut seen);
    }
    push(&request.subject, &mut terms, &mut seen);
    push(&request.body_text, &mut terms, &mut seen);
    push(&request.attachment_text, &mut terms, &mut seen);

    terms.truncate(config.max_terms);
    terms
}

/// Cases whose FTS row matches `term`, trying the Hebrew clitic-stripped form too.
///
/// `unicode61` does no morphology, so a clitic binds to its word: an email saying `ומחסן`
/// does not reach a case whose notes say `מחסן` (pinned by a test in
/// `case::case_text_index`). Stripping the query's clitic recovers that direction. The
/// reverse — a bare query term against an indexed clitic form — stays unreachable, since
/// the clitic sits at the *start* of the token where a prefix query cannot help.
fn cases_matching(conn: &Connection, sql: &str, term: &str) -> HashSet<i64> {
    let mut out = HashSet::new();
    let Ok(mut stmt) = conn.prepare(sql) else {
        return out;
    };
    let mut variants = vec![term.to_string()];
    if let Some(stripped) = strip_clitic_prefix(term) {
        variants.push(stripped);
    }
    for variant in variants {
        if variant.chars().count() < 3 {
            continue;
        }
        let expression = fts_term(&variant);
        let ids: Vec<i64> = match stmt.query_map(params![expression], |r| r.get::<_, i64>(0)) {
            Ok(rows) => rows.flatten().collect(),
            Err(_) => continue,
        };
        out.extend(ids);
    }
    out
}

const CASE_TEXT_SQL: &str = "SELECT rowid FROM case_text_fts WHERE case_text_fts MATCH ?1";

const DOCUMENT_SQL: &str = "
    SELECT DISTINCT d.case_id
    FROM documents_fts fts
    JOIN documents d ON d.id = fts.rowid
    WHERE documents_fts MATCH ?1 AND d.case_id IS NOT NULL";

fn active_case_count(conn: &Connection) -> f64 {
    conn.query_row(
        "SELECT COUNT(*) FROM cases WHERE deleted = 0 OR deleted IS NULL",
        [],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
    .max(1) as f64
}

/// Evidence needed before coverage is believed. In IDF units: roughly one rare term, or
/// a handful of common ones. Keeps a one-word email that happens to hit a case from
/// scoring as confidently as a paragraph that hits it on every distinctive word.
const SATURATION_K: f64 = 1.0;

/// Inverse document frequency over cases: a term matching almost every case says almost
/// nothing about which one this email belongs to.
///
/// Smoothed the way BM25 is, so it stays positive for a rare term however few cases exist
/// — the plain `ln(N / (1 + n))` form collapses to zero for every term once `n` reaches
/// `N / 2`, which on a small installation silences Tier B entirely. A term matching no
/// case is treated as matching one: unseen is at most as informative as rarest, and
/// letting it grow without bound would let a single stray word crush the whole score.
fn idf(total_cases: f64, matching: usize) -> f64 {
    let n = matching.max(1) as f64;
    (1.0 + (total_cases - n + 0.5) / (n + 0.5)).ln().max(0.0)
}

struct Coverage {
    /// Weighted share of the query's information content found in this case.
    score: f64,
    matched: Vec<String>,
}

fn score_source(
    conn: &Connection,
    sql: &str,
    terms: &[String],
    total_cases: f64,
) -> BTreeMap<i64, Coverage> {
    let mut per_term: Vec<(String, f64, HashSet<i64>)> = Vec::with_capacity(terms.len());
    let mut total_weight = 0.0;

    for term in terms {
        let cases = cases_matching(conn, sql, term);
        // A term matching nothing still counts towards the denominator: an email whose
        // vocabulary is absent from every case should score low, not be renormalized up.
        let weight = idf(total_cases, cases.len());
        total_weight += weight;
        per_term.push((term.clone(), weight, cases));
    }

    let mut out: BTreeMap<i64, Coverage> = BTreeMap::new();
    if total_weight <= 0.0 {
        return out;
    }

    let mut accumulated: HashMap<i64, (f64, Vec<String>)> = HashMap::new();
    for (term, weight, cases) in per_term {
        for case_id in cases {
            let entry = accumulated.entry(case_id).or_insert((0.0, Vec::new()));
            entry.0 += weight;
            entry.1.push(term.clone());
        }
    }

    for (case_id, (weight, matched)) in accumulated {
        // Coverage alone is a *share*, so a one-term query that hits anything scores 1.0.
        // Damping it by the absolute weight matched keeps thin evidence looking thin.
        let coverage = (weight / total_weight).clamp(0.0, 1.0);
        let saturation = weight / (weight + SATURATION_K);
        out.insert(
            case_id,
            Coverage {
                score: coverage * saturation,
                matched,
            },
        );
    }
    out
}

/// Titles shorter than this match too much to be evidence — a case called "Asaf" would
/// claim every email mentioning Asaf.
const MIN_TITLE_TERMS: usize = 2;

/// How much of a case's own title the email's subject reproduces.
///
/// Separate from [`evaluate`] because coverage over the whole email cannot express this.
/// A subject is the primary human-readable case reference in real correspondence, but it is
/// a handful of terms against a body and attachments that may run to thousands: divided by
/// the query's total weight, an exact title match is diluted to nothing. Measured on real
/// mail, a subject *identical* to a case's title scored 0.03 while an unrelated case won on
/// 32 boilerplate terms shared with its own attachments.
///
/// Scored against the *case title* rather than the email, so length of the email is
/// irrelevant: the question is how much of the case's name the sender wrote down.
fn subject_match(
    conn: &Connection,
    request: &CaseMatchRequest,
    config: &MatcherConfig,
) -> Result<Vec<(i64, SignalContribution)>, String> {
    let subject_terms: HashSet<String> = tokenize(&request.subject)
        .filter(|t| t.chars().count() >= 3 && !is_stop_word(t))
        .collect();
    if subject_terms.is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            "SELECT id, COALESCE(subject,''), COALESCE(name,'') FROM cases
             WHERE deleted = 0 OR deleted IS NULL",
        )
        .map_err(|e| format!("[subject_match] {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for (case_id, subject, name) in rows.flatten() {
        // The case's subject is its title; `name` is the client, which routinely appears in
        // unrelated mail and would match far too much on its own.
        let title: HashSet<String> = tokenize(&subject)
            .filter(|t| t.chars().count() >= 3 && !is_stop_word(t))
            .collect();
        if title.len() < MIN_TITLE_TERMS {
            continue;
        }

        let hits = title
            .iter()
            .filter(|t| {
                subject_terms.contains(*t)
                    || strip_clitic_prefix(t)
                        .map(|s| subject_terms.contains(&s))
                        .unwrap_or(false)
            })
            .count();
        if hits < MIN_TITLE_TERMS {
            continue;
        }

        let raw = hits as f64 / title.len() as f64;
        out.push((
            case_id,
            SignalContribution {
                tier: "B",
                name: "subject_match",
                raw,
                weighted: raw * config.weights.subject_match,
                detail: format!(
                    "subject carries {hits} of {} terms from case title \"{}\"",
                    title.len(),
                    subject.chars().take(40).collect::<String>()
                ),
                // A shared title is strong but not proof: two matters for one client can be
                // titled almost identically.
                decisive: false,
            },
        ));
        let _ = name;
    }
    Ok(out)
}

/// Evaluate content similarity for every case with any term overlap.
pub fn evaluate(
    conn: &Connection,
    request: &CaseMatchRequest,
    config: &MatcherConfig,
) -> Result<Vec<(i64, SignalContribution)>, String> {
    let mut out = subject_match(conn, request, config)?;

    let terms = query_terms(request, config);
    if terms.is_empty() {
        return Ok(out);
    }

    let total_cases = active_case_count(conn);
    let case_text = score_source(conn, CASE_TEXT_SQL, &terms, total_cases);
    let documents = score_source(conn, DOCUMENT_SQL, &terms, total_cases);

    let mut case_ids: Vec<i64> = case_text.keys().chain(documents.keys()).copied().collect();
    case_ids.sort_unstable();
    case_ids.dedup();

    for case_id in case_ids {
        let text_score = case_text.get(&case_id).map(|c| c.score).unwrap_or(0.0);
        let doc_score = documents.get(&case_id).map(|c| c.score).unwrap_or(0.0);

        // Case text is weighted higher because it is always present, whereas document
        // linkage depends on users filing files into case folders.
        //
        // Note that `weights.content * case_text_weight` is 0.42 under the shipped defaults,
        // below the 0.45 review threshold — so Tier B cannot surface a case on its own
        // however well it matches. Measured, not assumed: reworking this blend (noisy-OR,
        // and renormalizing over the sources that spoke) moved no metric, because the
        // limiter is the absolute coverage a bag-of-words match achieves, not the mixture.
        // Resolving it is a weights/threshold question and belongs to P6's sweep.
        let blended = text_score * config.case_text_weight + doc_score * config.document_weight;
        if blended <= 0.0 {
            continue;
        }

        let mut matched: Vec<String> = case_text
            .get(&case_id)
            .map(|c| c.matched.clone())
            .unwrap_or_default();
        matched.extend(
            documents
                .get(&case_id)
                .map(|c| c.matched.clone())
                .unwrap_or_default(),
        );
        matched.sort();
        matched.dedup();
        let shown: Vec<&str> = matched.iter().take(4).map(|s| s.as_str()).collect();

        out.push((
            case_id,
            SignalContribution {
                tier: "B",
                name: "content",
                raw: blended,
                weighted: blended * config.weights.content,
                detail: format!(
                    "{} of {} terms matched ({})",
                    matched.len(),
                    terms.len(),
                    shown.join(", ")
                ),
                // Content similarity is never decisive on its own: vocabulary overlap
                // between two matters of the same kind is normal.
                decisive: false,
            },
        ));
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::case::case_text_index::rebuild_case_text_fts;
    use crate::email::emails_case_api::CaseMatchPhase;
    use crate::email::EmailExtractedSignals;
    use crate::store::matcher_schema::init_matcher_schema;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE cases (id INTEGER PRIMARY KEY, subject TEXT, name TEXT, folder TEXT, deleted INTEGER DEFAULT 0);
             CREATE TABLE case_fields (case_id INTEGER, field_name TEXT, field_value TEXT);
             CREATE TABLE case_annotations (case_id INTEGER PRIMARY KEY, notes TEXT);
             CREATE TABLE case_emails (id INTEGER PRIMARY KEY, case_id INTEGER, message_id TEXT);
             CREATE TABLE pending_email_alerts (id INTEGER PRIMARY KEY, message_id TEXT);
             CREATE TABLE documents (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL, title TEXT,
                                     summary TEXT, authors TEXT, topics TEXT, entities TEXT,
                                     keywords TEXT, raw_text TEXT);
             CREATE VIRTUAL TABLE documents_fts USING fts5(
                title, summary, authors, topics, entities, keywords, raw_text,
                content='documents', content_rowid='id');
             CREATE TRIGGER docs_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, title, summary, authors, topics, entities, keywords, raw_text)
                VALUES (new.id, new.title, new.summary, new.authors, new.topics, new.entities, new.keywords, new.raw_text);
             END;",
        )
        .unwrap();
        init_matcher_schema(&conn).unwrap();
        conn
    }

    fn add_case(conn: &Connection, id: i64, subject: &str, notes: &str) {
        conn.execute(
            "INSERT INTO cases (id, subject, name) VALUES (?1, ?2, 'x')",
            params![id, subject],
        )
        .unwrap();
        if !notes.is_empty() {
            conn.execute(
                "INSERT INTO case_annotations (case_id, notes) VALUES (?1, ?2)",
                params![id, notes],
            )
            .unwrap();
        }
        rebuild_case_text_fts(conn, id).unwrap();
    }

    fn add_document(conn: &Connection, id: i64, case_id: i64, text: &str) {
        conn.execute(
            "INSERT INTO documents (id, file_path, title, raw_text, case_id)
             VALUES (?1, ?2, 'doc', ?3, ?4)",
            params![id, format!("/f/{id}.docx"), text, case_id],
        )
        .unwrap();
    }

    fn request(subject: &str, body: &str) -> CaseMatchRequest {
        CaseMatchRequest {
            message_id: "<m@x>".into(),
            sender: "a@b.com".into(),
            subject: subject.into(),
            snippet: body.into(),
            body_text: body.into(),
            attachment_text: String::new(),
            in_reply_to: None,
            references: vec![],
            search_terms: vec![],
            deterministic: EmailExtractedSignals::default(),
            classification: None,
            phase: CaseMatchPhase::AfterDeterministic,
        }
    }

    fn run(conn: &Connection, req: &CaseMatchRequest) -> Vec<(i64, SignalContribution)> {
        evaluate(conn, req, &MatcherConfig::default()).unwrap()
    }

    #[test]
    fn ranks_the_case_that_shares_vocabulary() {
        let conn = db();
        add_case(&conn, 1, "מכירת דירה", "חניה ומחסן ורכוש משותף");
        add_case(&conn, 2, "תאונת דרכים", "ביטוח ונזק ורכב");

        let hits = run(&conn, &request("בעניין הדירה", "לגבי חניה ומחסן"));
        let best = hits
            .iter()
            .max_by(|a, b| a.1.weighted.partial_cmp(&b.1.weighted).unwrap())
            .unwrap();
        assert_eq!(best.0, 1, "expected the conveyancing case, got {hits:?}");
    }

    #[test]
    fn content_is_never_decisive() {
        let conn = db();
        add_case(&conn, 1, "מכירת דירה", "חניה ומחסן");
        let hits = run(&conn, &request("דירה", "חניה"));
        assert!(hits.iter().all(|(_, s)| !s.decisive));
    }

    /// An email whose vocabulary appears in no case must score ~0 rather than being
    /// renormalized up to the top of a bad field — the decoy case.
    #[test]
    fn unrelated_vocabulary_scores_near_zero() {
        let conn = db();
        add_case(&conn, 1, "מכירת דירה", "חניה ומחסן");
        let hits = run(&conn, &request("הזמנה לוובינר", "שיווק דיגיטלי לעסקים"));
        assert!(
            hits.iter().all(|(_, s)| s.weighted < 0.2),
            "unrelated text scored too high: {hits:?}"
        );
    }

    #[test]
    fn a_term_shared_by_every_case_carries_little_weight() {
        let conn = db();
        for id in 1..=6 {
            add_case(&conn, id, "מכירת דירה", "");
        }
        // "דירה" is in every case, so matching it alone is nearly uninformative.
        let hits = run(&conn, &request("דירה", ""));
        assert!(
            hits.iter().all(|(_, s)| s.weighted < 0.3),
            "a universal term should not confer confidence: {hits:?}"
        );
    }

    #[test]
    fn document_text_contributes() {
        let conn = db();
        add_case(&conn, 1, "תיק", "");
        add_case(&conn, 2, "תיק", "");
        add_document(&conn, 10, 1, "פרוטוקול בעניין מחסן וחניה משותפת");

        let hits = run(&conn, &request("", "מחסן חניה"));
        let for_case_1 = hits.iter().find(|(id, _)| *id == 1);
        assert!(for_case_1.is_some(), "document text was not searched: {hits:?}");
    }

    #[test]
    fn documents_of_other_cases_do_not_leak() {
        let conn = db();
        add_case(&conn, 1, "תיק א", "");
        add_case(&conn, 2, "תיק ב", "");
        add_document(&conn, 10, 2, "מחסן וחניה");

        let hits = run(&conn, &request("", "מחסן חניה"));
        let ids: Vec<i64> = hits.iter().map(|(id, _)| *id).collect();
        assert!(ids.contains(&2));
        assert!(!ids.contains(&1), "case 1 owns no matching document");
    }

    #[test]
    fn unassigned_documents_are_ignored() {
        let conn = db();
        add_case(&conn, 1, "תיק", "");
        conn.execute(
            "INSERT INTO documents (id, file_path, title, raw_text, case_id)
             VALUES (99, '/x.docx', 'doc', 'מחסן וחניה', NULL)",
            [],
        )
        .unwrap();
        let hits = run(&conn, &request("", "מחסן חניה"));
        assert!(hits.is_empty(), "a document with no case must not score one");
    }

    #[test]
    fn stop_words_do_not_drive_the_match() {
        let conn = db();
        add_case(&conn, 1, "שלום תודה בברכה", "");
        let hits = run(&conn, &request("שלום", "תודה בברכה"));
        assert!(hits.is_empty(), "matched purely on function words: {hits:?}");
    }

    #[test]
    fn empty_email_yields_nothing() {
        let conn = db();
        add_case(&conn, 1, "מכירת דירה", "");
        assert!(run(&conn, &request("", "")).is_empty());
    }

    /// The reported failure: an email whose subject *is* a case's title was filed to a
    /// different case, because two decisive subject terms were diluted by ~38 boilerplate
    /// terms from an attachment that happened to resemble the other case's documents.
    #[test]
    fn a_subject_matching_a_case_title_outranks_bulk_vocabulary() {
        let conn = db();
        add_case(&conn, 29, "כל מסמכי התבנית", "");
        add_case(&conn, 35, "pdf tests", "טופס תבנית מסמך בקשה אישור");
        add_document(&conn, 10, 35, "טופס תבנית מסמך בקשה אישור נספח הצהרה קבלה");

        let mut req = request("כל מסמכי התבנית", "טופס תבנית מסמך בקשה אישור נספח הצהרה קבלה");
        req.attachment_text = "טופס תבנית מסמך בקשה אישור נספח הצהרה קבלה".into();

        let hits = run(&conn, &req);
        let best = hits
            .iter()
            .max_by(|a, b| a.1.weighted.partial_cmp(&b.1.weighted).unwrap())
            .expect("something must match");
        assert_eq!(best.0, 29, "the case named by the subject must win: {hits:?}");
    }

    #[test]
    fn subject_match_is_never_decisive() {
        let conn = db();
        add_case(&conn, 1, "מכירת דירה בנאמנות", "");
        let hits = run(&conn, &request("מכירת דירה בנאמנות", ""));
        assert!(hits.iter().all(|(_, s)| !s.decisive));
    }

    /// One shared word is a coincidence, not a title match.
    #[test]
    fn a_single_shared_title_word_is_not_a_subject_match() {
        let conn = db();
        add_case(&conn, 1, "מכירת דירה בנאמנות", "");
        let hits = run(&conn, &request("מכירת רכב", ""));
        assert!(
            !hits.iter().any(|(_, s)| s.name == "subject_match"),
            "one word must not count: {hits:?}"
        );
    }

    /// A one-word case title would otherwise claim every email containing that word.
    #[test]
    fn a_short_case_title_never_produces_a_subject_match() {
        let conn = db();
        add_case(&conn, 1, "אסף", "");
        let hits = run(&conn, &request("אסף", ""));
        assert!(!hits.iter().any(|(_, s)| s.name == "subject_match"));
    }

    /// FTS5 binds Hebrew clitics to their word, so the query side must try both forms.
    #[test]
    fn clitic_prefixed_case_text_is_still_reachable() {
        let conn = db();
        add_case(&conn, 1, "תיק", "הנכס כולל ומחסן גדול");
        let hits = run(&conn, &request("", "ומחסן"));
        assert!(!hits.is_empty(), "clitic form should match itself");
    }
}
