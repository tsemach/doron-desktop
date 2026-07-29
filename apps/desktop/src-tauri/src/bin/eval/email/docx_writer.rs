//! Minimal OOXML (.docx) writer for corpus generation.
//!
//! The document eval generator shells out to `python/create_docx.py`; this does the
//! same job natively so corpus generation has no Python dependency and runs in CI.
//! Output is a real docx package (content types + rels + document part), and is read
//! back by the app's own `extractor::docx::extract_docx`, which pulls text from
//! `<w:t>` runs inside `<w:p>` paragraphs.
//!
//! Zip entry timestamps are pinned so a given seed produces byte-identical files.

use std::io::Write;
use std::path::Path;

const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#;

const ROOT_RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#;

fn escape_xml(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            // Control characters are illegal in XML 1.0 and would make the part
            // unparseable; drop them rather than emitting a broken document.
            c if (c as u32) < 0x20 && c != '\t' => {}
            c => out.push(c),
        }
    }
    out
}

fn document_xml(paragraphs: &[String]) -> String {
    let mut body = String::new();
    for para in paragraphs {
        body.push_str(&format!(
            r#"<w:p><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
            escape_xml(para)
        ));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr/></w:body></w:document>"#
    )
}

/// Write `paragraphs` as a .docx at `path`. Parent directories must already exist.
pub fn write_docx(path: &Path, paragraphs: &[String]) -> Result<(), String> {
    let file = std::fs::File::create(path)
        .map_err(|e| format!("Failed to create {}: {e}", path.display()))?;
    let mut zip = zip::ZipWriter::new(file);

    // Fixed timestamp: zip entries otherwise embed wall-clock time, which would break
    // the "same seed produces byte-identical output" guarantee.
    let opts = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .last_modified_time(
            zip::DateTime::from_date_and_time(2020, 1, 1, 0, 0, 0)
                .map_err(|e| format!("Invalid fixed zip timestamp: {e:?}"))?,
        );

    for (name, contents) in [
        ("[Content_Types].xml", CONTENT_TYPES.to_string()),
        ("_rels/.rels", ROOT_RELS.to_string()),
        ("word/document.xml", document_xml(paragraphs)),
    ] {
        zip.start_file(name, opts)
            .map_err(|e| format!("Failed to start zip entry {name}: {e}"))?;
        zip.write_all(contents.as_bytes())
            .map_err(|e| format!("Failed to write zip entry {name}: {e}"))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize {}: {e}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("ascurix_docx_writer_tests");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn roundtrips_through_the_apps_own_extractor() {
        let path = tmp("roundtrip.docx");
        let paragraphs = vec![
            "כתב תביעה".to_string(),
            "בעניין גוש 972 חלקה 11".to_string(),
            "Plaintiff v. Defendant".to_string(),
        ];
        write_docx(&path, &paragraphs).unwrap();

        let extracted = tauri_app_lib::extractor::extract(&path).unwrap();
        for para in &paragraphs {
            assert!(
                extracted.text.contains(para),
                "extracted text missing {para:?}; got {:?}",
                extracted.text
            );
        }
    }

    #[test]
    fn escapes_xml_metacharacters() {
        let path = tmp("escaped.docx");
        write_docx(&path, &vec![r#"A & B <tag> "quoted""#.to_string()]).unwrap();
        let extracted = tauri_app_lib::extractor::extract(&path).unwrap();
        assert!(extracted.text.contains("A & B <tag>"));
    }

    #[test]
    fn output_is_byte_identical_across_writes() {
        let a = tmp("stable_a.docx");
        let b = tmp("stable_b.docx");
        let paragraphs = vec!["שורה אחת".to_string(), "שורה שתיים".to_string()];
        write_docx(&a, &paragraphs).unwrap();
        write_docx(&b, &paragraphs).unwrap();
        assert_eq!(
            std::fs::read(&a).unwrap(),
            std::fs::read(&b).unwrap(),
            "docx bytes must not depend on wall-clock time"
        );
    }

    #[test]
    fn empty_document_is_still_valid() {
        let path = tmp("empty.docx");
        write_docx(&path, &[]).unwrap();
        let extracted = tauri_app_lib::extractor::extract(&path).unwrap();
        assert_eq!(extracted.text.trim(), "");
    }
}
