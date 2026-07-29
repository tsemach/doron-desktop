//! Reads text out of email attachments so it can feed signal extraction (design §5.1).
//!
//! **Read-only.** Ingestion already stages attachments to disk; this opens those files
//! and nothing more. Staging, the `attachments_json` shape, import into the case folder
//! on confirm, and display are all untouched.
//!
//! Extraction uses `crate::extractor`, the same code the document indexer runs, so an
//! attachment tokenizes identically to a case document. Failure is never fatal: an
//! unreadable attachment degrades to no text rather than failing the pipeline, because
//! one corrupt PDF must not stop an email from being classified.

use std::path::Path;

use super::types::AttachmentMetadata;

#[derive(Debug, Clone)]
pub struct AttachmentLimits {
    pub max_files: usize,
    pub max_bytes_per_file: u64,
    pub max_chars_total: usize,
}

impl Default for AttachmentLimits {
    fn default() -> Self {
        Self {
            max_files: 10,
            max_bytes_per_file: 10 * 1024 * 1024,
            max_chars_total: 200_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct AttachmentText {
    pub name: String,
    pub text: String,
    pub extracted: bool,
    pub skip_reason: Option<String>,
}

impl AttachmentText {
    fn skipped(name: &str, reason: impl Into<String>) -> Self {
        Self {
            name: name.to_string(),
            text: String::new(),
            extracted: false,
            skip_reason: Some(reason.into()),
        }
    }
}

fn is_supported(name: &str) -> bool {
    let lower = name.to_lowercase();
    ["docx", "pdf", "xlsx", "xls", "txt"]
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

fn extract_one(att: &AttachmentMetadata, limits: &AttachmentLimits) -> AttachmentText {
    if !is_supported(&att.name) {
        return AttachmentText::skipped(&att.name, "unsupported file type");
    }

    let path = Path::new(&att.staged_path);
    if !path.exists() {
        return AttachmentText::skipped(&att.name, "staged file missing");
    }

    match std::fs::metadata(path) {
        Ok(meta) if meta.len() > limits.max_bytes_per_file => {
            return AttachmentText::skipped(
                &att.name,
                format!("exceeds {} MiB", limits.max_bytes_per_file / (1024 * 1024)),
            );
        }
        Ok(meta) if meta.len() == 0 => {
            return AttachmentText::skipped(&att.name, "empty file");
        }
        Err(e) => return AttachmentText::skipped(&att.name, format!("unreadable: {e}")),
        _ => {}
    }

    match crate::extractor::extract(path) {
        Ok(extracted) => AttachmentText {
            name: att.name.clone(),
            text: extracted.text,
            extracted: true,
            skip_reason: None,
        },
        Err(e) => AttachmentText::skipped(&att.name, format!("extraction failed: {e}")),
    }
}

/// Extract text from every staged attachment listed in `attachments_json`.
///
/// Never returns an error: a malformed JSON blob or an unreadable file yields an empty
/// result, matching the pipeline's contract that attachments enrich matching but are
/// never required for it.
pub fn extract_attachment_texts(
    attachments_json: &str,
    limits: &AttachmentLimits,
) -> Vec<AttachmentText> {
    let attachments: Vec<AttachmentMetadata> =
        serde_json::from_str(attachments_json).unwrap_or_default();

    let mut out = Vec::new();
    let mut used_chars = 0usize;

    for att in attachments.into_iter().take(limits.max_files) {
        let mut result = extract_one(&att, limits);

        if result.extracted {
            let remaining = limits.max_chars_total.saturating_sub(used_chars);
            if remaining == 0 {
                result = AttachmentText::skipped(&att.name, "total character budget reached");
            } else if result.text.chars().count() > remaining {
                result.text = result.text.chars().take(remaining).collect();
                used_chars = limits.max_chars_total;
            } else {
                used_chars += result.text.chars().count();
            }
        }
        out.push(result);
    }
    out
}

/// Flatten extracted attachment text into one blob for signal extraction.
pub fn combined_text(texts: &[AttachmentText]) -> String {
    texts
        .iter()
        .filter(|t| t.extracted && !t.text.trim().is_empty())
        .map(|t| format!("{}\n{}", t.name, t.text))
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("ascurix_attachment_tests");
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(name: &str, contents: &str) -> AttachmentMetadata {
        let path = tmp_dir().join(name);
        std::fs::write(&path, contents).unwrap();
        AttachmentMetadata {
            name: name.to_string(),
            staged_path: path.to_string_lossy().to_string(),
            size_kb: contents.len() as i64 / 1024,
            is_imported: None,
        }
    }

    fn json(items: &[AttachmentMetadata]) -> String {
        serde_json::to_string(items).unwrap()
    }

    #[test]
    fn extracts_text_from_a_supported_attachment() {
        let att = write("claim.txt", "בעניין גוש 972 חלקה 11");
        let out = extract_attachment_texts(&json(&[att]), &AttachmentLimits::default());
        assert_eq!(out.len(), 1);
        assert!(out[0].extracted);
        assert!(out[0].text.contains("גוש 972"));
    }

    #[test]
    fn unsupported_types_are_skipped_with_a_reason_not_an_error() {
        let att = write("scan.png", "not really a png");
        let out = extract_attachment_texts(&json(&[att]), &AttachmentLimits::default());
        assert!(!out[0].extracted);
        assert_eq!(out[0].skip_reason.as_deref(), Some("unsupported file type"));
    }

    #[test]
    fn missing_staged_file_is_skipped() {
        let att = AttachmentMetadata {
            name: "gone.txt".into(),
            staged_path: "/nonexistent/gone.txt".into(),
            size_kb: 1,
            is_imported: None,
        };
        let out = extract_attachment_texts(&json(&[att]), &AttachmentLimits::default());
        assert!(!out[0].extracted);
        assert_eq!(out[0].skip_reason.as_deref(), Some("staged file missing"));
    }

    #[test]
    fn empty_file_is_skipped() {
        let att = write("empty.txt", "");
        let out = extract_attachment_texts(&json(&[att]), &AttachmentLimits::default());
        assert!(!out[0].extracted);
        assert_eq!(out[0].skip_reason.as_deref(), Some("empty file"));
    }

    #[test]
    fn oversize_file_is_skipped() {
        let att = write("big.txt", "x".repeat(2048).as_str());
        let limits = AttachmentLimits {
            max_bytes_per_file: 1024,
            ..Default::default()
        };
        let out = extract_attachment_texts(&json(&[att]), &limits);
        assert!(!out[0].extracted);
        assert!(out[0].skip_reason.as_deref().unwrap().contains("exceeds"));
    }

    #[test]
    fn corrupt_file_of_a_supported_type_does_not_panic() {
        // A .docx that is not a zip — extraction must fail gracefully.
        let att = write("broken.docx", "this is definitely not a docx");
        let out = extract_attachment_texts(&json(&[att]), &AttachmentLimits::default());
        assert!(!out[0].extracted);
        assert!(out[0].skip_reason.is_some());
    }

    #[test]
    fn malformed_json_yields_nothing_rather_than_failing() {
        assert!(extract_attachment_texts("{not json", &AttachmentLimits::default()).is_empty());
        assert!(extract_attachment_texts("[]", &AttachmentLimits::default()).is_empty());
    }

    #[test]
    fn file_count_is_capped() {
        let atts: Vec<_> = (0..5)
            .map(|i| write(&format!("f{i}.txt"), "content"))
            .collect();
        let limits = AttachmentLimits {
            max_files: 2,
            ..Default::default()
        };
        assert_eq!(extract_attachment_texts(&json(&atts), &limits).len(), 2);
    }

    #[test]
    fn total_character_budget_truncates_rather_than_dropping() {
        let a = write("a.txt", &"א".repeat(100));
        let b = write("b.txt", &"ב".repeat(100));
        let limits = AttachmentLimits {
            max_chars_total: 150,
            ..Default::default()
        };
        let out = extract_attachment_texts(&json(&[a, b]), &limits);
        let total: usize = out.iter().map(|t| t.text.chars().count()).sum();
        assert!(total <= 150, "budget exceeded: {total}");
        assert!(out[0].extracted, "the first attachment should be kept whole");
    }

    #[test]
    fn combined_text_includes_names_and_skips_failures() {
        let good = write("deed.txt", "שטר 4471");
        let bad = write("image.png", "x");
        let out = extract_attachment_texts(&json(&[good, bad]), &AttachmentLimits::default());
        let combined = combined_text(&out);
        assert!(combined.contains("deed.txt"));
        assert!(combined.contains("שטר 4471"));
        assert!(!combined.contains("image.png"));
    }
}
