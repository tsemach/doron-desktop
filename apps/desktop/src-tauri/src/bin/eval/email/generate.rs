//! `eval email generate` — build a labelled email→case corpus on disk.
//!
//! Replaces the previous implementation, which only copied a static fixture file. The
//! corpus is the measuring instrument for every later phase, so it is generated from a
//! seed and is byte-reproducible.

use clap::Args;
use std::fs;
use std::path::Path;

use super::corpus::{self, Corpus, CorpusConfig, Lang};
use super::docx_writer::write_docx;

#[derive(Args, Debug, Clone)]
pub struct GenerateArgs {
    /// Output directory for the corpus
    #[arg(long, default_value = "./email_eval_corpus")]
    pub corpus_dir: String,

    /// Number of cases to synthesise
    #[arg(long, default_value = "30")]
    pub cases: usize,

    /// Number of email fixtures to synthesise
    #[arg(long, default_value = "200")]
    pub emails: usize,

    /// Attach documents to some emails (including identifier-only-in-attachment fixtures)
    #[arg(long)]
    pub with_attachments: bool,

    /// PRNG seed — the same seed reproduces the corpus byte for byte
    #[arg(long, default_value = "42")]
    pub seed: u64,

    /// Share of emails that are not case related at all
    #[arg(long, default_value = "0.25")]
    pub unrelated_ratio: f64,

    /// Content language: he | en | mixed
    #[arg(long, default_value = "mixed")]
    pub lang: String,

    /// Litigation/conveyancing weighting, e.g. 50/50 or 70/30
    #[arg(long, default_value = "50/50")]
    pub practice_mix: String,
}

fn parse_lang(value: &str) -> Result<Lang, String> {
    match value.to_lowercase().as_str() {
        "he" => Ok(Lang::He),
        "en" => Ok(Lang::En),
        "mixed" => Ok(Lang::Mixed),
        other => Err(format!("Unknown --lang '{other}' (expected he | en | mixed)")),
    }
}

fn parse_practice_mix(value: &str) -> Result<(u32, u32), String> {
    let (a, b) = value
        .split_once('/')
        .ok_or_else(|| format!("--practice-mix '{value}' must look like 50/50"))?;
    let lit = a
        .trim()
        .parse::<u32>()
        .map_err(|_| format!("--practice-mix '{value}': '{}' is not a number", a.trim()))?;
    let conv = b
        .trim()
        .parse::<u32>()
        .map_err(|_| format!("--practice-mix '{value}': '{}' is not a number", b.trim()))?;
    Ok((lit, conv))
}

/// Remove previously generated artefacts only. Leftovers from an earlier run with
/// different parameters would otherwise linger and break reproducibility checks.
fn clean_generated(root: &Path) -> Result<(), String> {
    for sub in ["cases", "attachments"] {
        let path = root.join(sub);
        if path.exists() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to clear {}: {e}", path.display()))?;
        }
    }
    for file in [
        "cases.json",
        "email_matching_dataset.json",
        "corpus_manifest.json",
    ] {
        let path = root.join(file);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove {}: {e}", path.display()))?;
        }
    }
    Ok(())
}

fn write_document(
    root: &Path,
    rel_dir: &str,
    file_name: &str,
    paragraphs: &[String],
) -> Result<(), String> {
    let dir = root.join(rel_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    let path = dir.join(file_name);

    if file_name.ends_with(".docx") {
        write_docx(&path, paragraphs)
    } else {
        fs::write(&path, paragraphs.join("\n"))
            .map_err(|e| format!("Failed to write {}: {e}", path.display()))
    }
}

fn write_corpus(root: &Path, corpus: &Corpus) -> Result<(), String> {
    for case in &corpus.cases {
        for (file_name, paragraphs) in &case.document_bodies {
            write_document(root, &case.folder, file_name, paragraphs)?;
        }
    }

    for email in &corpus.emails {
        for att in &email.attachments {
            write_document(root, "attachments", &att.name, &att.paragraphs)?;
        }
    }

    let cases_json = serde_json::to_string_pretty(&corpus.cases)
        .map_err(|e| format!("Failed to serialize cases: {e}"))?;
    fs::write(root.join("cases.json"), cases_json)
        .map_err(|e| format!("Failed to write cases.json: {e}"))?;

    let emails_json = serde_json::to_string_pretty(&corpus.emails)
        .map_err(|e| format!("Failed to serialize emails: {e}"))?;
    fs::write(root.join("email_matching_dataset.json"), emails_json)
        .map_err(|e| format!("Failed to write email_matching_dataset.json: {e}"))?;

    let manifest = serde_json::to_string_pretty(&corpus.manifest)
        .map_err(|e| format!("Failed to serialize manifest: {e}"))?;
    fs::write(root.join("corpus_manifest.json"), manifest)
        .map_err(|e| format!("Failed to write corpus_manifest.json: {e}"))?;

    Ok(())
}

/// Preserve the legacy LLM-classification fixture so `eval email run --mode classification`
/// keeps working against a corpus produced by this command.
fn copy_legacy_classification_fixture(root: &Path) {
    let source = Path::new("tests/email/fixtures/email_classification_dataset.json");
    if !source.exists() {
        return;
    }
    let dest = root.join("email_classification_dataset.json");
    if let Err(e) = fs::copy(source, &dest) {
        eprintln!("Warning: could not copy legacy classification fixture: {e}");
    }
}

pub async fn execute(args: GenerateArgs) -> Result<(), String> {
    let config = CorpusConfig {
        cases: args.cases,
        emails: args.emails,
        with_attachments: args.with_attachments,
        seed: args.seed,
        unrelated_ratio: args.unrelated_ratio,
        lang: parse_lang(&args.lang)?,
        practice_mix: parse_practice_mix(&args.practice_mix)?,
    };

    let root = Path::new(&args.corpus_dir);
    fs::create_dir_all(root).map_err(|e| format!("Failed to create corpus directory: {e}"))?;
    clean_generated(root)?;

    println!(
        "Generating corpus: {} cases, {} emails, seed {}, practice mix {} ({})",
        config.cases, config.emails, config.seed, args.practice_mix, args.lang
    );

    let corpus = corpus::build(&config)?;
    write_corpus(root, &corpus)?;
    copy_legacy_classification_fixture(root);

    let doc_count: usize = corpus.cases.iter().map(|c| c.documents.len()).sum();
    let att_count: usize = corpus.emails.iter().map(|e| e.attachments.len()).sum();

    println!("\nWritten to {}", root.display());
    println!("  cases.json                    {} cases", corpus.cases.len());
    println!("  cases/                        {doc_count} documents");
    println!("  attachments/                  {att_count} files");
    println!(
        "  email_matching_dataset.json   {} fixtures",
        corpus.emails.len()
    );
    println!(
        "\nInspect with:  eval email corpus-stats --corpus-dir {}",
        args.corpus_dir
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_practice_mix() {
        assert_eq!(parse_practice_mix("50/50").unwrap(), (50, 50));
        assert_eq!(parse_practice_mix("70 / 30").unwrap(), (70, 30));
        assert!(parse_practice_mix("50").is_err());
        assert!(parse_practice_mix("a/b").is_err());
    }

    #[test]
    fn parses_lang() {
        assert!(matches!(parse_lang("he").unwrap(), Lang::He));
        assert!(matches!(parse_lang("MIXED").unwrap(), Lang::Mixed));
        assert!(parse_lang("fr").is_err());
    }
}
