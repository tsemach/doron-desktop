//! Normalization shared by both sides of a case match.
//!
//! The case-identifier index (`case_identifiers.value_norm`) and the signals extracted
//! from an incoming email must agree exactly, or Tier A degrades from an indexed lookup
//! to nothing. That only holds if one function normalizes both — hence this module
//! rather than a copy on each side.
//!
//! Hebrew specifics: no casing, geresh/gershayim used freely in abbreviations
//! (`עו"ד`, `ת.ז`), five letters take a different form word-finally, and single-letter
//! clitics (`ו ה ב ל מ כ ש`) attach directly to a word. Ignoring these makes an exact
//! match fail on text a human reads as identical.

/// Hebrew final forms mapped to their medial equivalents.
fn fold_final_forms(ch: char) -> char {
    match ch {
        'ך' => 'כ',
        'ם' => 'מ',
        'ן' => 'נ',
        'ף' => 'פ',
        'ץ' => 'צ',
        other => other,
    }
}

fn is_quote_mark(ch: char) -> bool {
    matches!(ch, '\'' | '"' | '\u{05F3}' | '\u{05F4}' | '\u{2018}' | '\u{2019}' | '\u{201C}' | '\u{201D}')
}

/// Canonical form for exact matching: lowercased, quote marks removed, Hebrew final
/// forms folded, punctuation reduced to single spaces, whitespace collapsed.
pub fn normalize_for_match(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut last_was_space = true; // leading spaces are dropped

    for ch in value.chars() {
        if is_quote_mark(ch) {
            continue;
        }
        let ch = fold_final_forms(ch);
        if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                out.push(lower);
            }
            last_was_space = false;
        } else if !last_was_space {
            out.push(' ');
            last_was_space = true;
        }
    }
    out.trim_end().to_string()
}

const CLITIC_PREFIXES: [char; 7] = ['ו', 'ה', 'ב', 'ל', 'מ', 'כ', 'ש'];

/// Strip one leading Hebrew clitic, if doing so leaves a plausible word.
///
/// Returns `None` when the word is too short to strip safely — `בית` must not become
/// `ית`. Prefix stripping is lossy, so callers keep the original as well and treat this
/// as an *additional* candidate rather than a replacement.
pub fn strip_clitic_prefix(word: &str) -> Option<String> {
    let mut chars = word.chars();
    let first = chars.next()?;
    if !CLITIC_PREFIXES.contains(&first) {
        return None;
    }
    let rest: String = chars.collect();
    if rest.chars().count() < 3 {
        return None;
    }
    Some(rest)
}

/// All forms a value should be matched under: the canonical form, plus per-word
/// clitic-stripped variants. Order is stable and the canonical form is always first.
pub fn match_variants(value: &str) -> Vec<String> {
    let canonical = normalize_for_match(value);
    let mut out = vec![canonical.clone()];

    let stripped: Vec<String> = canonical
        .split(' ')
        .filter(|w| !w.is_empty())
        .map(|w| strip_clitic_prefix(w).unwrap_or_else(|| w.to_string()))
        .collect();

    if !stripped.is_empty() {
        let joined = stripped.join(" ");
        if joined != canonical {
            out.push(joined);
        }
    }
    out
}

/// Addresses must NOT go through [`normalize_for_match`]: it treats `@` and `.` as
/// punctuation and would turn `adv@lawfirm.co.il` into `adv lawfirm co il`, so a sender
/// could never match its indexed form. Case is the only thing worth folding here.
pub fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

/// Digits only — the canonical form for phones, national IDs and company IDs, where
/// separators are cosmetic (`05x-xxx xxxx`, `03-1234567`, `123456789`).
pub fn normalize_digits(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_digit()).collect()
}

/// Court case number canonicalised to `number/year`, tolerating spaces around the slash.
pub fn normalize_case_number(value: &str) -> Option<String> {
    let (num, year) = value.split_once('/')?;
    let num = normalize_digits(num);
    let year = normalize_digits(year);
    if num.is_empty() || year.is_empty() {
        return None;
    }
    Some(format!("{num}/{year}"))
}

/// Canonical land-registry key: `gush/helka` or `gush/helka/tat`.
///
/// Stored as a composite because the components are only selective together — a `גוש`
/// alone covers an area containing many properties and must never identify a matter on
/// its own (design §5.5 A2/A4).
pub fn land_registry_key(gush: &str, helka: &str, tat: Option<&str>) -> Option<String> {
    let g = normalize_digits(gush);
    let h = normalize_digits(helka);
    if g.is_empty() || h.is_empty() {
        return None;
    }
    match tat.map(normalize_digits) {
        Some(t) if !t.is_empty() => Some(format!("{g}/{h}/{t}")),
        _ => Some(format!("{g}/{h}")),
    }
}

/// Longest-prefix candidates for a land-registry key, most specific first:
/// `972/11/33` → `["972/11/33", "972/11"]`. Lets Tier A prefer a full match and fall
/// back to the (non-decisive) parcel-level one.
pub fn land_registry_prefixes(key: &str) -> Vec<String> {
    let parts: Vec<&str> = key.split('/').collect();
    let mut out = Vec::new();
    if parts.len() >= 3 {
        out.push(format!("{}/{}/{}", parts[0], parts[1], parts[2]));
    }
    if parts.len() >= 2 {
        out.push(format!("{}/{}", parts[0], parts[1]));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_hebrew_final_forms() {
        // Same word written with and without the final form must collide.
        assert_eq!(normalize_for_match("שלום"), normalize_for_match("שלומ"));
        assert_eq!(normalize_for_match("ארץ"), normalize_for_match("ארצ"));
    }

    #[test]
    fn strips_geresh_and_gershayim() {
        assert_eq!(normalize_for_match("עו\"ד"), "עוד");
        assert_eq!(normalize_for_match("עו״ד"), "עוד");
        assert_eq!(normalize_for_match("נ׳"), "נ");
        assert_eq!(normalize_for_match("ת.ז"), "ת ז");
    }

    #[test]
    fn collapses_punctuation_and_whitespace() {
        // Note the folded final form: כהן → כהנ, so the two spellings collide.
        assert_eq!(normalize_for_match("  כהן   נ'  לוי  "), "כהנ נ לוי");
        assert_eq!(normalize_for_match("A & B <tag>"), "a b tag");
    }

    #[test]
    fn party_pair_matches_regardless_of_final_form_or_geresh() {
        assert_eq!(
            normalize_for_match("כהן נ' לוי"),
            normalize_for_match("כהנ נ׳ לוי")
        );
    }

    #[test]
    fn lowercases_latin() {
        assert_eq!(normalize_for_match("Cohen V. Levy"), "cohen v levy");
    }

    #[test]
    fn clitic_stripping_is_guarded() {
        assert_eq!(strip_clitic_prefix("המגרש").as_deref(), Some("מגרש"));
        assert_eq!(strip_clitic_prefix("בדירה").as_deref(), Some("דירה"));
        // Too short to strip safely — must stay intact.
        assert_eq!(strip_clitic_prefix("בית"), None);
        // Not a clitic.
        assert_eq!(strip_clitic_prefix("דירה"), None);
    }

    #[test]
    fn variants_keep_the_canonical_form_first() {
        let v = match_variants("המגרש הגדול");
        assert_eq!(v[0], "המגרש הגדול");
        assert!(v.contains(&"מגרש גדול".to_string()));
    }

    #[test]
    fn variants_do_not_duplicate_when_nothing_strips() {
        assert_eq!(match_variants("דירה"), vec!["דירה".to_string()]);
    }

    #[test]
    fn emails_keep_their_structure() {
        assert_eq!(normalize_email("  Adv@LawFirm.co.il "), "adv@lawfirm.co.il");
        // The general normalizer would destroy the address — guard against a future
        // refactor routing addresses through it.
        assert_ne!(normalize_for_match("adv@lawfirm.co.il"), "adv@lawfirm.co.il");
    }

    #[test]
    fn digits_ignore_separators() {
        assert_eq!(normalize_digits("054-123 4567"), "0541234567");
        assert_eq!(normalize_digits("ת.ז 123456782"), "123456782");
    }

    #[test]
    fn case_numbers_canonicalise() {
        assert_eq!(normalize_case_number("12345/23").as_deref(), Some("12345/23"));
        assert_eq!(normalize_case_number("12345 / 23").as_deref(), Some("12345/23"));
        assert_eq!(normalize_case_number("תיק 12345/23").as_deref(), Some("12345/23"));
        assert_eq!(normalize_case_number("12345"), None);
    }

    #[test]
    fn land_registry_composites() {
        assert_eq!(land_registry_key("972", "11", Some("33")).as_deref(), Some("972/11/33"));
        assert_eq!(land_registry_key("972", "11", None).as_deref(), Some("972/11"));
        assert_eq!(land_registry_key("גוש 972", "חלקה 11", Some("")).as_deref(), Some("972/11"));
        assert_eq!(land_registry_key("972", "", None), None);
    }

    #[test]
    fn land_registry_prefixes_are_most_specific_first() {
        assert_eq!(land_registry_prefixes("972/11/33"), vec!["972/11/33", "972/11"]);
        assert_eq!(land_registry_prefixes("972/11"), vec!["972/11"]);
    }

    #[test]
    fn normalization_is_idempotent() {
        for input in ["עו\"ד כהן", "  Cohen  V.  Levy ", "תיק 12345/23"] {
            let once = normalize_for_match(input);
            assert_eq!(normalize_for_match(&once), once, "input {input:?}");
        }
    }
}
