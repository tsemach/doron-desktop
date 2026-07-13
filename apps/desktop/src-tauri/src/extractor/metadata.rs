use regex::Regex;
use std::collections::HashSet;
use crate::llm::DocumentMetadata;

/// Main entry point to extract heuristic metadata from raw text.
pub fn extract_heuristic_metadata(text: &str, file_name: &str, ext: &str) -> DocumentMetadata {
    let lang = extract_language(text);
    let title = extract_title(text, file_name);
    let summary = extract_summary(text);
    let date = extract_date(text);
    let entities = extract_entities(text, &lang);
    let doc_type = infer_doc_type(text, ext);

    DocumentMetadata {
        doc_type: Some(serde_json::Value::String(doc_type)),
        title: Some(title),
        summary: Some(summary),
        authors: Some(vec![]),
        date,
        topics: Some(vec![]),
        entities: Some(entities),
        language: Some(lang),
        keywords: Some(vec![]),
        confidence: Some(1.0),
    }
}

/// Detects if language is Hebrew ("he") or English ("en") based on character distribution.
pub fn extract_language(text: &str) -> String {
    let mut hebrew_chars = 0;
    let mut total_alpha = 0;

    for c in text.chars() {
        if c.is_alphabetic() {
            total_alpha += 1;
            if c >= '\u{0590}' && c <= '\u{05FF}' {
                hebrew_chars += 1;
            }
        }
    }

    if total_alpha > 0 && (hebrew_chars as f64 / total_alpha as f64) > 0.15 {
        "he".to_string()
    } else {
        "en".to_string()
    }
}

/// Extracts title from the first non-empty line under 120 chars, otherwise falls back to file name.
pub fn extract_title(text: &str, file_name: &str) -> String {
    for line in text.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && trimmed.len() >= 8 && trimmed.len() <= 120 {
            // Check that it's not a generic page header or bullet point
            if !trimmed.starts_with('*') && !trimmed.starts_with('-') && !trimmed.starts_with("עמוד") && !trimmed.starts_with("page") {
                return trimmed.to_string();
            }
        }
    }
    // Remove extension from file name if fallback
    if let Some(pos) = file_name.rfind('.') {
        file_name[..pos].to_string()
    } else {
        file_name.to_string()
    }
}

/// Extracts the first 2-3 sentences as a summary.
pub fn extract_summary(text: &str) -> String {
    let mut sentences = Vec::new();
    let mut current = String::new();

    for c in text.chars() {
        current.push(c);
        if c == '.' || c == '?' || c == '!' {
            let trimmed = current.trim().to_string();
            if trimmed.chars().count() > 15 {
                sentences.push(trimmed);
            }
            current.clear();
            if sentences.len() >= 3 {
                break;
            }
        }
    }

    if sentences.is_empty() {
        // Fallback: take first 250 characters
        let char_limit = text.chars().take(250).collect::<String>();
        if char_limit.trim().is_empty() {
            "Skeletal document (indexed without LLM metadata)".to_string()
        } else {
            format!("{}...", char_limit.trim())
        }
    } else {
        sentences.join(" ")
    }
}

/// Scans the first 2000 chars for common date formats and normalizes them to YYYY-MM-DD.
pub fn extract_date(text: &str) -> Option<String> {
    let scan_limit = text.chars().take(2000).collect::<String>();
    
    // 1. Matches YYYY-MM-DD
    let re_ymd = Regex::new(r"\b(19\d\d|20\d\d)[-/.]?(0[1-9]|1[0-2])[-/.]?(0[1-9]|[12]\d|3[01])\b").unwrap();
    if let Some(caps) = re_ymd.captures(&scan_limit) {
        return Some(format!("{}-{}-{}", caps.get(1).unwrap().as_str(), caps.get(2).unwrap().as_str(), caps.get(3).unwrap().as_str()));
    }

    // 2. Matches DD/MM/YYYY or DD.MM.YYYY
    let re_dmy = Regex::new(r"\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](19\d\d|20\d\d)\b").unwrap();
    if let Some(caps) = re_dmy.captures(&scan_limit) {
        return Some(format!("{}-{}-{}", caps.get(3).unwrap().as_str(), caps.get(2).unwrap().as_str(), caps.get(1).unwrap().as_str()));
    }

    None
}

/// Infers document type based on file extension and keyword indicators.
pub fn infer_doc_type(text: &str, ext: &str) -> String {
    let normalized_ext = ext.to_lowercase();
    if normalized_ext == "xlsx" || normalized_ext == "xls" {
        return "spreadsheet".to_string();
    }
    if normalized_ext == "pptx" || normalized_ext == "ppt" {
        return "presentation".to_string();
    }

    let search_limit = text.chars().take(1500).collect::<String>().to_lowercase();
    
    if search_limit.contains("חוזה") || search_limit.contains("הסכם") || search_limit.contains("שכירות") || search_limit.contains("contract") || search_limit.contains("agreement") {
        "contract".to_string()
    } else if search_limit.contains("מכתב") || search_limit.contains("לכבוד") || search_limit.contains("הנדון") || search_limit.contains("dear") {
        "letter".to_string()
    } else if search_limit.contains("חשבונית") || search_limit.contains("קבלה") || search_limit.contains("invoice") {
        "invoice".to_string()
    } else if search_limit.contains("דוח") || search_limit.contains("דו\"ח") || search_limit.contains("report") || search_limit.contains("סקירה") {
        "report".to_string()
    } else if search_limit.contains("צוואה") || search_limit.contains("will") {
        "will".to_string()
    } else if search_limit.contains("פרוטוקול") || search_limit.contains("זיכרון דברים") || search_limit.contains("memo") || search_limit.contains("memorandum") {
        "memo".to_string()
    } else {
        "other".to_string()
    }
}

/// Extracts names/entities from text.
pub fn extract_entities(text: &str, lang: &str) -> Vec<String> {
    let mut entities = HashSet::new();

    if lang == "he" {
        // 1. Hebrew Parties (between בין: and לבין:)
        let normalized = text.replace('\r', "\n");
        let re_between = Regex::new(r#"(?i)בין\s*:?\s*([א-ת0-9\s"'\.]{3,40}?)(?:\s+ת\.ז|\s+ח\.פ|\s+ח\.צ|\s+לבין|\s*,\s*|\n|$)"#).unwrap();
        let re_and_between = Regex::new(r#"(?i)לבין\s*:?\s*([א-ת0-9\s"'\.]{3,40}?)(?:\s+ת\.ז|\s+ח\.פ|\s+ח\.צ|\s+לבין|\s+ושלהלן|\s*,\s*|\n|$)"#).unwrap();

        if let Some(caps) = re_between.captures(&normalized) {
            let name = caps.get(1).unwrap().as_str().trim().to_string();
            if name.chars().count() > 3 && !name.contains('\n') {
                entities.insert(name);
            }
        }
        if let Some(caps) = re_and_between.captures(&normalized) {
            let name = caps.get(1).unwrap().as_str().trim().to_string();
            if name.chars().count() > 3 && !name.contains('\n') {
                entities.insert(name);
            }
        }

        // 2. Prefix matching (עו"ד, חברת, השופט, השופטת, מר, גב')
        let re_prefixes = Regex::new(
            r#"(?i)(עו"ד|עורך\s+דין|חברת|השופט|השופטת|מר|גב')\s+([א-ת]{2,12}(?:\s+[א-ת"']{2,12}){1,2})"#
        ).unwrap();

        for caps in re_prefixes.captures_iter(text).take(10) {
            let prefix = caps.get(1).unwrap().as_str().trim();
            let name = caps.get(2).unwrap().as_str().trim();
            if !name.is_empty() && name.chars().count() > 3 {
                entities.insert(format!("{} {}", prefix, name));
            }
        }
    } else {
        // English proper nouns (capitalized word sequences)
        let re_eng_names = Regex::new(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b").unwrap();
        for caps in re_eng_names.captures_iter(text).take(10) {
            let entity = caps.get(1).unwrap().as_str().trim().to_string();
            if !entity.is_empty() && entity.chars().count() > 3 {
                // Exclude common sentence starters if single word (already handled by regex needing 2+ capitalized words)
                entities.insert(entity);
            }
        }
    }

    entities.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_language() {
        let hebrew_text = "שלום עולם, זהו מסמך בעברית המיועד לבדיקה.";
        let english_text = "Hello world, this is a document in English for testing.";
        assert_eq!(extract_language(hebrew_text), "he");
        assert_eq!(extract_language(english_text), "en");
    }

    #[test]
    fn test_extract_title() {
        let text_with_title = "\n\nהסכם שכירות בלתי מוגנת\nשנערך ביום 1 לחודש...";
        assert_eq!(extract_title(text_with_title, "lease.docx"), "הסכם שכירות בלתי מוגנת");

        let short_text = "שלום";
        assert_eq!(extract_title(short_text, "lease.docx"), "lease");
    }

    #[test]
    fn test_extract_summary() {
        let text = "זהו המשפט הראשון במסמך. והנה מגיע המשפט השני שלו. וזהו המשפט השלישי.";
        assert_eq!(extract_summary(text), "זהו המשפט הראשון במסמך. והנה מגיע המשפט השני שלו. וזהו המשפט השלישי.");

        let empty = "   ";
        assert_eq!(extract_summary(empty), "Skeletal document (indexed without LLM metadata)");
    }

    #[test]
    fn test_extract_date() {
        let text_iso = "הסכם זה נחתם בתאריך 2026-07-11 בין הצדדים.";
        assert_eq!(extract_date(text_iso), Some("2026-07-11".to_string()));

        let text_slash = "הסכם זה נחתם בתאריך 11/07/2026 בין הצדדים.";
        assert_eq!(extract_date(text_slash), Some("2026-07-11".to_string()));

        let text_dot = "הסכם זה נחתם בתאריך 11.07.2026 בין הצדדים.";
        assert_eq!(extract_date(text_dot), Some("2026-07-11".to_string()));
    }

    #[test]
    fn test_infer_doc_type() {
        let text_contract = "זהו הסכם שכירות רשמי לנכס ברחוב...";
        assert_eq!(infer_doc_type(text_contract, "docx"), "contract");

        let text_invoice = "חשבונית מס מועד תשלום...";
        assert_eq!(infer_doc_type(text_invoice, "pdf"), "invoice");
    }

    #[test]
    fn test_extract_entities_hebrew() {
        let contract_text = "הסכם זה נערך בין: יצחק לוי ת.ז 1234 לבין: משה כהן ת.ז 5678.\nעו\"ד שמעון ברק מייצג את חברת אלפא בע\"מ.";
        let entities = extract_entities(contract_text, "he");
        
        assert!(entities.contains(&"יצחק לוי".to_string()));
        assert!(entities.contains(&"משה כהן".to_string()));
        assert!(entities.contains(&"עו\"ד שמעון ברק".to_string()));
        assert!(entities.contains(&"חברת אלפא בע\"מ".to_string()));
    }

    #[test]
    fn test_extract_entities_english() {
        let text = "This agreement is between John Doe and Jane Smith at Acme Corporation.";
        let entities = extract_entities(text, "en");

        assert!(entities.contains(&"John Doe".to_string()));
        assert!(entities.contains(&"Jane Smith".to_string()));
        assert!(entities.contains(&"Acme Corporation".to_string()));
    }
}
