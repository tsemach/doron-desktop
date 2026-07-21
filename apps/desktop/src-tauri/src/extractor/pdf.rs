use std::path::Path;

/// pdf_extract outputs Hebrew RTL text in visual order (characters reversed).
/// For any line that is predominantly Hebrew, reverse it back to logical order.
fn fix_rtl(text: &str) -> String {
    text.lines()
        .map(|line| {
            let non_space: usize = line.chars().filter(|c| !c.is_whitespace()).count();
            if non_space == 0 {
                return line.to_string();
            }
            let hebrew: usize = line.chars().filter(|&c| {
                matches!(c as u32, 0x0590..=0x05FF | 0xFB1D..=0xFBFF)
            }).count();
            // >20% Hebrew chars → treat whole line as RTL, reverse char-by-char
            if hebrew * 5 > non_space {
                line.chars().rev().collect()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn extract_pdf(path: &Path) -> Result<(String, i32), String> {
    let raw = pdf_extract::extract_text(path).map_err(|e| e.to_string())?;
    let text = fix_rtl(&raw);
    let page_count = page_count(path);
    Ok((text, page_count))
}

fn page_count(path: &Path) -> i32 {
    match lopdf::Document::load(path) {
        Ok(doc) => doc.get_pages().len() as i32,
        Err(err) => {
            eprintln!(
                "Warning: lopdf failed to load document metadata for {:?}: {}. Falling back to page count 1.",
                path, err
            );
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn fix_rtl_reverses_predominantly_hebrew_lines() {
        // pdf_extract often emits Hebrew in visual (reversed) order.
        let visual = "חוטיב הרפס";
        let fixed = fix_rtl(visual);
        assert_eq!(fixed, "ספרה ביטוח");
    }

    #[test]
    fn fix_rtl_leaves_english_lines_unchanged() {
        let line = "Hello PDF search test";
        assert_eq!(fix_rtl(line), line);
    }

    #[test]
    fn fix_rtl_leaves_mixed_low_hebrew_lines_unchanged() {
        let line = "Report 2024 - ref #12345";
        assert_eq!(fix_rtl(line), line);
    }

    #[test]
    fn fix_rtl_handles_multiline_documents() {
        let input = "Hello PDF search test\nחוטיב הרפס\ncontract agreement";
        let output = fix_rtl(input);
        assert!(output.contains("Hello PDF search test"));
        assert!(output.contains("ספרה ביטוח"));
        assert!(output.contains("contract agreement"));
    }

    #[test]
    fn extract_pdf_reads_text_from_fixture() {
        let path = Path::new("tests/docs/sample-search.pdf");
        assert!(path.exists(), "missing fixture: {:?}", path);

        let (text, pages) = extract_pdf(path).expect("PDF extraction should succeed");

        assert!(pages >= 1, "expected at least one page");
        assert!(
            text.contains("Hello PDF search test"),
            "expected English phrase in extracted text, got: {text:?}"
        );
        assert!(
            text.contains("contract agreement"),
            "expected second phrase in extracted text, got: {text:?}"
        );
    }

    #[test]
    fn extract_routes_pdf_through_mod_extract() {
        let path = Path::new("tests/docs/sample-search.pdf");
        let extracted = crate::extractor::extract(path).expect("extract() should route PDF");

        assert!(!extracted.text.is_empty());
        assert_eq!(extracted.page_count, Some(1));
        assert!(extracted.text.contains("Hello PDF search test"));
    }
}
