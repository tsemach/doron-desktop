//! Deterministic signal extraction from email headers and body text (regex / header parse).
//! Runs before the LLM so case numbers, IDs, phones, etc. are surfaced reliably.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

use crate::extractor::metadata::extract_date;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct EmailExtractedSignals {
    pub sender_email: Option<String>,
    pub sender_name: Option<String>,
    pub sender_domain_hint: Option<String>,
    pub case_numbers: Vec<String>,
    pub emails: Vec<String>,
    pub phone_numbers: Vec<String>,
    pub national_ids: Vec<String>,
    pub company_ids: Vec<String>,
    /// Canonical land-registry keys, `gush/helka[/tat]` (design §5.2).
    pub land_registry: Vec<String>,
    pub deeds: Vec<String>,
    pub dates: Vec<String>,
    pub party_names: Vec<String>,
}

struct EmailPatterns {
    case_number: Regex,
    case_number_labeled: Regex,
    email: Regex,
    phone_il: Regex,
    phone_intl: Regex,
    phone_us: Regex,
    phone_labeled: Regex,
    national_id_he: Regex,
    national_id_en: Regex,
    company_id_hp: Regex,
    company_id_hz: Regex,
    company_id_en: Regex,
    gush: Regex,
    helka: Regex,
    tat_helka: Regex,
    deed: Regex,
    party_he: Regex,
    party_he_nged: Regex,
    party_en: Regex,
}

fn patterns() -> &'static EmailPatterns {
    static PATTERNS: OnceLock<EmailPatterns> = OnceLock::new();
    PATTERNS.get_or_init(|| EmailPatterns {
        // Works adjacent to Hebrew/English text (no ASCII \b).
        case_number: Regex::new(r"(?:^|[\s,:;\-(\[])(\d{1,6}/\d{2,4})(?:$|[\s,.;)\]])").unwrap(),
        case_number_labeled: Regex::new(
            r#"(?i)(?:תיק|ע"א|ע"פ|ת"א|בש"א|רע"א|ה"פ|ת"צ|ע"ח|case|matter|docket|file(?:\s+no)?|ref(?:erence)?|cause(?:\s+no)?)\s*[#:.]?\s*(\d{1,6}/\d{2,4})"#,
        )
        .unwrap(),
        email: Regex::new(
            r"(?i)\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b",
        )
        .unwrap(),
        phone_il: Regex::new(r"0(?:5[0-9]|7[2-9])[-\s.]?\d{3}[-\s.]?\d{4}").unwrap(),
        phone_intl: Regex::new(
            r"\+?972[-\s.]?(?:5[0-9]|7[2-9])[-\s.]?\d{3}[-\s.]?\d{4}",
        )
        .unwrap(),
        phone_us: Regex::new(
            r"\+?1?[-\s.]?\(?\d{3}\)?[-\s.]?\d{3}[-\s.]?\d{4}",
        )
        .unwrap(),
        phone_labeled: Regex::new(
            r"(?i)(?:טלפון|נייד|פקס|phone|tel(?:ephone)?|mobile|cell|fax)\s*[:.]?\s*([+\d][\d\s().\-]{7,18}\d)",
        )
        .unwrap(),
        national_id_he: Regex::new(r"(?i)ת\.?\s*ז\.?\s*:?\s*(\d{7,9})").unwrap(),
        national_id_en: Regex::new(
            r"(?i)(?:id|national\s+id|identity(?:\s+no)?|passport)(?:\s+no\.?|#|:)?\s*(\d{7,9})",
        )
        .unwrap(),
        company_id_hp: Regex::new(r"(?i)ח\.?\s*פ\.?\s*:?\s*(\d{8,9})").unwrap(),
        company_id_hz: Regex::new(r"(?i)ח\.?\s*צ\.?\s*:?\s*(\d{8,9})").unwrap(),
        company_id_en: Regex::new(
            r"(?i)(?:company(?:\s+reg(?:istration)?)?|reg(?:istration)?|tax\s+id|vat|ein)(?:\s+no\.?|#|:)?\s*(\d{8,9})",
        )
        .unwrap(),
        // Land-registry components. Written apart, reordered, or comma-separated, so
        // each is matched independently and assembled afterwards by proximity.
        gush: Regex::new(r"(?i)גוש(?:\s+ספר)?\s*[:.#]?\s*(\d{1,5})").unwrap(),
        // `תת חלקה` must be tried before `חלקה`, since it contains it.
        tat_helka: Regex::new(r"(?i)תת[-\s]*חלקה\s*[:.#]?\s*(\d{1,4})").unwrap(),
        helka: Regex::new(r"(?i)חלקה(?:\s+דף)?\s*[:.#]?\s*(\d{1,4})").unwrap(),
        deed: Regex::new(r"(?i)שטר(?:\s+(?:מספר|מס\.?))?\s*[:.#]?\s*(\d{2,6})").unwrap(),
        party_he: Regex::new(
            r#"([א-ת][א-ת\s"'׳״\-]{1,30}?)\s+נ['׳]\s+([א-ת][א-ת\s"'׳״\-]{1,30})"#,
        )
        .unwrap(),
        party_he_nged: Regex::new(
            r#"([א-ת][א-ת\s"'׳״\-]{1,30}?)\s+נגד\s+([א-ת][א-ת\s"'׳״\-]{1,30})"#,
        )
        .unwrap(),
        party_en: Regex::new(
            r"(?i)\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:v\.?|vs\.?|versus)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
        )
        .unwrap(),
    })
}


/// Proximity window for pairing land-registry components, in bytes. Hebrew is ~2
/// bytes/char, so this is roughly 80 characters — wide enough for
/// "גוש 972, חלקה 11, תת חלקה 33" written with labels and separators, narrow enough
/// that two unrelated plots in the same paragraph do not cross-pair.
const PLOT_WINDOW_BYTES: usize = 160;

#[derive(Debug, Clone)]
struct Located {
    start: usize,
    end: usize,
    value: String,
}

fn locate(re: &Regex, text: &str) -> Vec<Located> {
    re.captures_iter(text)
        .filter_map(|c| {
            let whole = c.get(0)?;
            Some(Located {
                start: whole.start(),
                end: whole.end(),
                value: c.get(1)?.as_str().to_string(),
            })
        })
        .collect()
}

fn overlaps(item: &Located, others: &[Located]) -> bool {
    others.iter().any(|o| item.start < o.end && o.start < item.end)
}

/// Distance between two spans, 0 when they touch or overlap.
fn gap(a: &Located, b: &Located) -> usize {
    if a.end <= b.start {
        b.start - a.end
    } else if b.end <= a.start {
        a.start - b.end
    } else {
        0
    }
}

fn nearest<'a>(anchor: &Located, candidates: &'a [Located]) -> Option<&'a Located> {
    candidates
        .iter()
        .filter(|c| gap(anchor, c) <= PLOT_WINDOW_BYTES)
        .min_by_key(|c| gap(anchor, c))
}

/// Assemble `gush/helka[/tat]` keys and deed numbers from free text.
///
/// Components are extracted separately because an email writes them in any order and
/// with arbitrary separators; they are then paired by proximity. A `גוש` with no nearby
/// `חלקה` yields nothing — a block spans many properties and cannot identify a matter
/// (design §5.5 A2/A4).
fn extract_land_registry(text: &str, p: &EmailPatterns) -> (Vec<String>, Vec<String>) {
    let tats = locate(&p.tat_helka, text);
    // `חלקה` also matches inside `תת חלקה`, so drop those overlaps.
    let helkas: Vec<Located> = locate(&p.helka, text)
        .into_iter()
        .filter(|h| !overlaps(h, &tats))
        .collect();
    let gushes = locate(&p.gush, text);

    let mut keys: Vec<String> = Vec::new();
    for gush in &gushes {
        let Some(helka) = nearest(gush, &helkas) else {
            continue;
        };
        let tat = nearest(helka, &tats);
        if let Some(key) = crate::email::land_registry_key(
            &gush.value,
            &helka.value,
            tat.map(|t| t.value.as_str()),
        ) {
            push_unique(&mut keys, &key);
        }
    }

    let mut deeds: Vec<String> = Vec::new();
    for d in locate(&p.deed, text) {
        push_unique(&mut deeds, &d.value);
    }

    (keys, deeds)
}

pub fn extract_email_signals(sender: &str, subject: &str, snippet: &str) -> EmailExtractedSignals {
    let (sender_name, sender_email) = parse_sender(sender);
    let combined = format!("{subject}\n{snippet}");
    let p = patterns();

    let mut signals = EmailExtractedSignals {
        sender_email: sender_email.clone(),
        sender_name,
        sender_domain_hint: sender_domain_hint(sender_email.as_deref()).map(str::to_string),
        ..Default::default()
    };

    signals.case_numbers = extract_case_numbers(&combined, p);
    signals.emails = extract_emails(&combined, p, signals.sender_email.as_deref());
    signals.phone_numbers = extract_phones(&combined, p);
    signals.national_ids = extract_national_ids(&combined, p);
    signals.company_ids = extract_company_ids(&combined, p);
    let (land_registry, deeds) = extract_land_registry(&combined, p);
    signals.land_registry = land_registry;
    signals.deeds = deeds;
    signals.dates = extract_dates(&combined);
    signals.party_names = extract_party_names(&combined, p);

    signals
}

fn parse_sender(sender: &str) -> (Option<String>, Option<String>) {
    let trimmed = sender.trim();
    if trimmed.is_empty() {
        return (None, None);
    }

    if let Some(start) = trimmed.find('<') {
        if let Some(end) = trimmed.find('>') {
            if end > start {
                let name = trimmed[..start].trim().trim_matches('"').trim();
                let email = trimmed[start + 1..end].trim().to_lowercase();
                return (
                    if name.is_empty() {
                        None
                    } else {
                        Some(name.to_string())
                    },
                    if email.is_empty() {
                        None
                    } else {
                        Some(email)
                    },
                );
            }
        }
    }

    if trimmed.contains('@') {
        return (None, Some(trimmed.to_lowercase()));
    }

    (Some(trimmed.to_string()), None)
}

fn extract_case_numbers(text: &str, p: &EmailPatterns) -> Vec<String> {
    let mut out = Vec::new();
    for caps in p.case_number.captures_iter(text) {
        if let Some(num) = caps.get(1) {
            push_unique(&mut out, num.as_str());
        }
    }
    for caps in p.case_number_labeled.captures_iter(text) {
        if let Some(num) = caps.get(1) {
            push_unique(&mut out, num.as_str());
        }
    }
    out
}

fn extract_emails(text: &str, p: &EmailPatterns, sender_email: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    for m in p.email.find_iter(text) {
        push_unique(&mut out, &m.as_str().to_lowercase());
    }
    if let Some(sender) = sender_email {
        push_unique(&mut out, sender);
    }
    out
}

fn extract_phones(text: &str, p: &EmailPatterns) -> Vec<String> {
    let mut out = Vec::new();
    for m in p.phone_il.find_iter(text) {
        push_unique(&mut out, &normalize_phone(m.as_str()));
    }
    for m in p.phone_intl.find_iter(text) {
        push_unique(&mut out, &normalize_phone(m.as_str()));
    }
    for m in p.phone_us.find_iter(text) {
        push_unique(&mut out, &normalize_phone(m.as_str()));
    }
    for caps in p.phone_labeled.captures_iter(text) {
        if let Some(raw) = caps.get(1) {
            push_unique(&mut out, &normalize_phone(raw.as_str()));
        }
    }
    out
}

fn extract_national_ids(text: &str, p: &EmailPatterns) -> Vec<String> {
    let mut out = extract_captures(text, &p.national_id_he, 1);
    for id in extract_captures(text, &p.national_id_en, 1) {
        push_unique(&mut out, &id);
    }
    out
}

fn normalize_phone(raw: &str) -> String {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.starts_with("972") && digits.len() >= 11 {
        format!("0{}", &digits[3..])
    } else {
        digits
    }
}

fn extract_company_ids(text: &str, p: &EmailPatterns) -> Vec<String> {
    let mut out = extract_captures(text, &p.company_id_hp, 1);
    for id in extract_captures(text, &p.company_id_hz, 1) {
        push_unique(&mut out, &id);
    }
    for id in extract_captures(text, &p.company_id_en, 1) {
        push_unique(&mut out, &id);
    }
    out
}

fn extract_captures(text: &str, re: &Regex, group: usize) -> Vec<String> {
    let mut out = Vec::new();
    for caps in re.captures_iter(text) {
        if let Some(m) = caps.get(group) {
            push_unique(&mut out, m.as_str());
        }
    }
    out
}

fn extract_dates(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(date) = extract_date(text) {
        push_unique(&mut out, &date);
    }
    out
}

fn extract_party_names(text: &str, p: &EmailPatterns) -> Vec<String> {
    let mut out = Vec::new();
    for caps in p.party_he.captures_iter(text) {
        push_party_pair(&mut out, caps.get(1), caps.get(2), "נ'");
    }
    for caps in p.party_he_nged.captures_iter(text) {
        push_party_pair(&mut out, caps.get(1), caps.get(2), "נגד");
    }
    for caps in p.party_en.captures_iter(text) {
        let left = caps.get(1).map(|m| m.as_str().trim()).unwrap_or_default();
        let right = caps.get(2).map(|m| m.as_str().trim()).unwrap_or_default();
        push_unique(&mut out, &format!("{left} v. {right}"));
    }
    out
}

fn push_party_pair(
    out: &mut Vec<String>,
    left: Option<regex::Match<'_>>,
    right: Option<regex::Match<'_>>,
    separator: &str,
) {
    let left = left.map(|m| m.as_str().trim()).unwrap_or_default();
    let right = right.map(|m| m.as_str().trim()).unwrap_or_default();
    if left.chars().count() >= 2 && right.chars().count() >= 2 {
        push_unique(out, &format!("{left} {separator} {right}"));
    }
}

fn push_unique(out: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }
    let key = trimmed.to_lowercase();
    if out.iter().any(|v| v.to_lowercase() == key) {
        return;
    }
    out.push(trimmed.to_string());
}

impl EmailExtractedSignals {
    /// Flat list for search_terms merge: strongest structured signals first.
    pub fn to_search_terms(&self) -> Vec<String> {
        let mut out = Vec::new();
        for v in &self.case_numbers {
            push_unique(&mut out, v);
        }
        for v in &self.land_registry {
            push_unique(&mut out, v);
        }
        for v in &self.deeds {
            push_unique(&mut out, v);
        }
        for v in &self.party_names {
            push_unique(&mut out, v);
        }
        if let Some(name) = &self.sender_name {
            push_unique(&mut out, name);
        }
        for v in &self.emails {
            push_unique(&mut out, v);
        }
        for v in &self.phone_numbers {
            push_unique(&mut out, v);
        }
        for v in &self.national_ids {
            push_unique(&mut out, v);
        }
        for v in &self.company_ids {
            push_unique(&mut out, v);
        }
        for v in &self.dates {
            push_unique(&mut out, v);
        }
        out
    }

    /// JSON block injected into the LLM prompt as pre-extracted facts.
    pub fn to_prompt_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_else(|_| "{}".to_string())
    }
}

pub fn merge_search_terms(deterministic: Vec<String>, llm_terms: Vec<String>) -> Vec<String> {
    let mut out = deterministic;
    for term in llm_terms {
        push_unique(&mut out, &term);
    }
    out
}

/// Sender domain heuristic: law/court/gov domains are more likely case-related.
pub fn sender_domain_hint(sender_email: Option<&str>) -> Option<&'static str> {
    let email = sender_email?;
    let domain = email.split('@').nth(1)?.to_lowercase();
    if domain.ends_with(".gov.il") || domain.contains("court") {
        Some("court_or_authority")
    } else if domain.contains("law") || domain.starts_with("adv.") {
        Some("legal_professional")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_display_name_sender() {
        let (name, email) = parse_sender("Danny Stern <danny.stern@gmail.com>");
        assert_eq!(name, Some("Danny Stern".to_string()));
        assert_eq!(email, Some("danny.stern@gmail.com".to_string()));
    }

    #[test]
    fn extracts_case_number_from_subject() {
        let signals = extract_email_signals(
            "yossi.cohen@gmail.com",
            "עדכון תיק 12345/23 - כהן נ' לוי",
            "שלום עו\"ד",
        );
        assert!(signals.case_numbers.contains(&"12345/23".to_string()));
        assert!(signals
            .party_names
            .iter()
            .any(|p| p.contains("כהן") && p.contains("לוי")));
        assert_eq!(signals.sender_email, Some("yossi.cohen@gmail.com".to_string()));
    }

    #[test]
    fn extracts_hebrew_case_ref_and_date() {
        let signals = extract_email_signals(
            "noreply@courts.gov.il",
            "הזמנה לדיון בתיק 12345/23",
            "בית משפט השלום קובע דיון בתיק 12345/23 ליום 12.08.2026.",
        );
        assert_eq!(signals.case_numbers, vec!["12345/23"]);
        assert_eq!(signals.dates, vec!["2026-08-12"]);
        assert_eq!(
            signals.sender_domain_hint,
            Some("court_or_authority".to_string())
        );
    }

    #[test]
    fn extracts_ids_and_phones() {
        let signals = extract_email_signals(
            "client@example.com",
            "פרטי לקוח",
            "יוסי כהן ת.ז 123456789, טלפון 050-1234567, ח.פ 514123456",
        );
        assert!(signals.national_ids.contains(&"123456789".to_string()));
        assert!(signals.company_ids.contains(&"514123456".to_string()));
        assert!(signals.phone_numbers.contains(&"0501234567".to_string()));
    }

    #[test]
    fn merge_preserves_deterministic_order_first() {
        let merged = merge_search_terms(
            vec!["12345/23".to_string()],
            vec!["דיון".to_string(), "12345/23".to_string()],
        );
        assert_eq!(merged, vec!["12345/23", "דיון"]);
    }

    #[test]
    fn english_case_and_party() {
        let signals = extract_email_signals(
            "noreply@courts.gov",
            "Hearing notice - Case 12345/23",
            "Hearing in Smith v. Jones on August 12, 2026.",
        );
        assert!(signals.case_numbers.contains(&"12345/23".to_string()));
        assert!(signals
            .party_names
            .iter()
            .any(|p| p.contains("Smith") && p.contains("Jones")));
    }

    #[test]
    fn english_ids_and_labeled_phone() {
        let signals = extract_email_signals(
            "client@example.com",
            "Matter 67890/22",
            "John Smith, national ID 123456789, phone (555) 123-4567, company reg 514123456",
        );
        assert!(signals.case_numbers.contains(&"67890/22".to_string()));
        assert!(signals.national_ids.contains(&"123456789".to_string()));
        assert!(signals.company_ids.contains(&"514123456".to_string()));
        assert!(signals.phone_numbers.contains(&"5551234567".to_string()));
    }

    #[test]
    fn hebrew_party_nged_and_case_adjacent() {
        let signals = extract_email_signals(
            "adv@law.co.il",
            "כהן נגד לוי",
            "בקשה בתיק12345/23",
        );
        assert!(signals.case_numbers.contains(&"12345/23".to_string()));
        assert!(signals
            .party_names
            .iter()
            .any(|p| p.contains("כהן") && p.contains("לוי")));
    }

    #[test]
    fn english_party_vs_form() {
        let signals = extract_email_signals(
            "counsel@opposing.com",
            "Smith vs Jones",
            "Motion filed.",
        );
        assert!(signals
            .party_names
            .iter()
            .any(|p| p.contains("Smith") && p.contains("Jones")));
    }
}

#[cfg(test)]
mod land_registry_tests {
    use super::*;

    fn signals(text: &str) -> EmailExtractedSignals {
        extract_email_signals("", "", text)
    }

    #[test]
    fn extracts_full_composite() {
        let s = signals("בעניין גוש 972 חלקה 11 תת חלקה 33");
        assert_eq!(s.land_registry, vec!["972/11/33"]);
    }

    #[test]
    fn extracts_partial_without_sub_parcel() {
        let s = signals("העברת זכויות בגוש 972 חלקה 11");
        assert_eq!(s.land_registry, vec!["972/11"]);
    }

    /// The components are written in any order and with any separator, so all of these
    /// must normalize to the same key the case index stores.
    #[test]
    fn tolerates_separators_and_labels() {
        for text in [
            "גוש 972, חלקה 11, תת חלקה 33",
            "גוש ספר: 972 חלקה דף: 11 תת חלקה: 33",
            "גוש 972 - חלקה 11 - תת-חלקה 33",
            "גוש #972 חלקה #11 תת חלקה #33",
        ] {
            assert_eq!(signals(text).land_registry, vec!["972/11/33"], "input {text:?}");
        }
    }

    #[test]
    fn gush_alone_yields_nothing() {
        assert!(signals("הנכס נמצא בגוש 972").land_registry.is_empty());
    }

    #[test]
    fn sub_parcel_is_not_mistaken_for_the_parcel() {
        // `חלקה` also matches inside `תת חלקה`; without the overlap filter this would
        // produce 972/33 instead of 972/11/33.
        let s = signals("גוש 972 חלקה 11 תת חלקה 33");
        assert_eq!(s.land_registry, vec!["972/11/33"]);
        assert!(!s.land_registry.iter().any(|k| k == "972/33"));
    }

    #[test]
    fn two_distant_plots_do_not_cross_pair() {
        let filler = "מלל ".repeat(60); // well past the proximity window
        let text = format!("גוש 100 חלקה 5{filler}גוש 200 חלקה 9");
        let keys = signals(&text).land_registry;
        assert!(keys.contains(&"100/5".to_string()), "got {keys:?}");
        assert!(keys.contains(&"200/9".to_string()), "got {keys:?}");
        assert!(!keys.contains(&"100/9".to_string()), "components crossed: {keys:?}");
    }

    #[test]
    fn extracts_deed_numbers() {
        assert_eq!(signals("מצורף שטר 4471").deeds, vec!["4471"]);
        assert_eq!(signals("שטר מספר 4471").deeds, vec!["4471"]);
        assert_eq!(signals("שטר מס. 4471").deeds, vec!["4471"]);
    }

    #[test]
    fn land_registry_ranks_above_party_names_in_search_terms() {
        let s = signals("גוש 972 חלקה 11 בעניין כהן נ' לוי");
        let terms = s.to_search_terms();
        let lr = terms.iter().position(|t| t == "972/11").unwrap();
        let party = terms.iter().position(|t| t.contains("כהן")).unwrap();
        assert!(lr < party, "land registry must outrank party names: {terms:?}");
    }

    #[test]
    fn litigation_text_is_unaffected() {
        let s = signals("עדכון בתיק 12345/23");
        assert_eq!(s.case_numbers, vec!["12345/23"]);
        assert!(s.land_registry.is_empty());
        assert!(s.deeds.is_empty());
    }
}
