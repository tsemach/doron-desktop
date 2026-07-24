use std::path::Path;

pub fn extract_pdf(path: &Path) -> Result<(String, i32), String> {
    let path_str = path.to_str().ok_or_else(|| "PDF path is not valid UTF-8".to_string())?;
    let doc = pdf_oxide::PdfDocument::open(path_str).map_err(|e| e.to_string())?;

    let page_count = doc.page_count().map_err(|e| e.to_string())? as i32;
    let mut pages = Vec::with_capacity(page_count as usize);

    for page_index in 0..page_count {
        let page_text = doc
            .extract_text(page_index as usize)
            .map_err(|e| e.to_string())?;
        if !page_text.trim().is_empty() {
            pages.push(page_text);
        }
    }

    Ok((pages.join("\n\n"), page_count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

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
