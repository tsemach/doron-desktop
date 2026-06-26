use clap::Args;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri_app_lib::{
    indexer::{index_file_core, IndexOptions},
    query::search_documents_core,
    llm::llm_provider::{get_active_provider, ProviderConfig},
    store,
};

#[derive(Args, Debug, Clone)]
pub struct RunArgs {
    /// Directory containing the synthetic corpus
    #[arg(long, default_value = "./evaluation_corpus")]
    pub corpus_dir: String,

    /// Name/path of the SQLite database to use for the evaluation index
    #[arg(long, default_value = "evaluation_index.db")]
    pub db_name: String,

    /// Path to the ground-truth labeled JSON dataset
    #[arg(long, default_value = "tests/evaluation_dataset.json")]
    pub dataset_path: String,

    /// LLM provider type (e.g., mock, claude, gemini, openai, local, byom)
    #[arg(long, default_value = "mock")]
    pub provider: String,

    /// LLM model name
    #[arg(long)]
    pub model: Option<String>,

    /// Search retrieval algorithm (fts, vector, hybrid, hybrid-rerank)
    #[arg(long, default_value = "hybrid")]
    pub algorithm: String,

    /// API key for the LLM provider
    #[arg(long)]
    pub api_key: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
struct LabeledQuery {
    query: String,
    expected_files: Vec<String>,
}

pub async fn execute(args: RunArgs) -> Result<(), String> {
    let corpus_path = Path::new(&args.corpus_dir);
    if !corpus_path.exists() || !corpus_path.is_dir() {
        return Err(format!(
            "Corpus directory '{}' does not exist. Please run 'eval generate-corpus' first.",
            args.corpus_dir
        ));
    }

    let dataset_file = Path::new(&args.dataset_path);
    if !dataset_file.exists() {
        return Err(format!(
            "Dataset JSON file '{}' does not exist.",
            args.dataset_path
        ));
    }

    let dataset_data = fs::read_to_string(dataset_file)
        .map_err(|e| format!("Failed to read dataset file: {e}"))?;
    let queries: Vec<LabeledQuery> = serde_json::from_str(&dataset_data)
        .map_err(|e| format!("Failed to parse dataset JSON: {e}"))?;

    if queries.is_empty() {
        return Err("Labeled query dataset is empty.".to_string());
    }

    // Resolve db path and delete existing test database to ensure a fresh benchmark index
    let db_path = store::cli_db_path(&args.db_name);
    if db_path.exists() {
        let _ = fs::remove_file(&db_path);
    }

    println!("Initializing evaluation index database at: {}...", db_path.display());
    // Create/initialize connection and migrations
    let _conn = store::open_db_by_path(&db_path)?;

    // Scan corpus files
    let files: Vec<PathBuf> = walkdir::WalkDir::new(corpus_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .collect();

    if files.is_empty() {
        return Err(format!("No files found in corpus directory '{}'", args.corpus_dir));
    }

    // Setup AI provider
    let api_key = args.api_key.unwrap_or_default();
    let model = args.model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());
    let provider = get_active_provider(ProviderConfig {
        provider_type: args.provider.clone(),
        api_key,
        model: model.clone(),
        base_url: None,
    });

    // Configure indexing tracks based on target algorithm
    let run_llm_metadata = match args.algorithm.as_str() {
        "vector" => false,
        _ => true,
    };
    let run_vector_embeddings = match args.algorithm.as_str() {
        "fts" => false,
        _ => true,
    };

    let index_options = IndexOptions {
        run_llm_metadata,
        run_vector_embeddings,
    };

    println!(
        "Indexing {} documents (LLM Track: {}, Vector Track: {})...",
        files.len(),
        run_llm_metadata,
        run_vector_embeddings
    );

    let mut total_indexing_time = std::time::Duration::default();
    let mut indexed_count = 0;
    let mut failed_count = 0;

    for file in &files {
        let start = Instant::now();
        match index_file_core(&db_path, &provider, file, &index_options, true).await {
            Ok(_) => {
                total_indexing_time += start.elapsed();
                indexed_count += 1;
            }
            Err(e) => {
                eprintln!("Warning: Failed to index file {}: {}", file.display(), e);
                failed_count += 1;
            }
        }
    }

    let avg_indexing_ms = if indexed_count > 0 {
        total_indexing_time.as_millis() as f64 / indexed_count as f64
    } else {
        0.0
    };

    println!(
        "\x1b[32mIndexing Complete!\x1b[0m Indexed: {}, Failed: {}. Avg latency per file: {:.2}ms",
        indexed_count, failed_count, avg_indexing_ms
    );

    // 2. Execute retrieval queries & evaluate metrics
    println!("Running {} evaluation queries using algorithm: '{}'...", queries.len(), args.algorithm);

    let use_rerank = args.algorithm == "hybrid-rerank";
    let mut total_search_time = std::time::Duration::default();
    let mut hit_at_1_sum = 0;
    let mut hit_at_3_sum = 0;
    let mut mrr_sum = 0.0;

    println!("\n{:<55} | {:<20} | {:<8} | {:<8} | {:<5}", "Query", "Top File Returned", "P@1", "R@3", "Latency");
    println!("{}", "-".repeat(110));

    for q in &queries {
        let start = Instant::now();
        let search_results = match search_documents_core(&db_path, &provider, &q.query, 5, use_rerank).await {
            Ok(results) => results,
            Err(e) => {
                eprintln!("Error executing query '{}': {}", q.query, e);
                continue;
            }
        };
        let search_duration = start.elapsed();
        total_search_time += search_duration;

        let returned_filenames: Vec<String> = search_results
            .iter()
            .map(|r| r.file_name.clone())
            .collect();

        // Calculate Hit@1 (Precision@1)
        let hit_at_1 = if !returned_filenames.is_empty() && q.expected_files.contains(&returned_filenames[0]) {
            1
        } else {
            0
        };
        hit_at_1_sum += hit_at_1;

        // Calculate Hit@3 (Recall@3)
        let hit_at_3 = if returned_filenames.iter().take(3).any(|f| q.expected_files.contains(f)) {
            1
        } else {
            0
        };
        hit_at_3_sum += hit_at_3;

        // Calculate Reciprocal Rank (RR)
        let mut rr = 0.0;
        for (idx, filename) in returned_filenames.iter().enumerate() {
            if q.expected_files.contains(filename) {
                rr = 1.0 / (idx + 1) as f64;
                break;
            }
        }
        mrr_sum += rr;

        let top_returned = returned_filenames.first().cloned().unwrap_or_else(|| "NONE".to_string());
        println!(
            "{:<55} | {:<20} | {:<8} | {:<8} | {:.2}ms",
            if q.query.chars().count() > 50 {
                format!("{}...", q.query.chars().take(47).collect::<String>())
            } else {
                q.query.clone()
            },
            top_returned,
            if hit_at_1 == 1 { "\x1b[32mPASS\x1b[0m" } else { "\x1b[31mFAIL\x1b[0m" },
            if hit_at_3 == 1 { "\x1b[32mPASS\x1b[0m" } else { "\x1b[31mFAIL\x1b[0m" },
            search_duration.as_secs_f64() * 1000.0
        );
    }

    let avg_search_ms = (total_search_time.as_secs_f64() * 1000.0) / queries.len() as f64;
    let final_hit_at_1 = hit_at_1_sum as f64 / queries.len() as f64;
    let final_hit_at_3 = hit_at_3_sum as f64 / queries.len() as f64;
    let final_mrr = mrr_sum / queries.len() as f64;

    println!("\n=======================================================");
    println!("               EVALUATION REPORT SUMMARY               ");
    println!("=======================================================");
    println!("Algorithm:             {}", args.algorithm);
    println!("Provider / Model:      {} / {}", args.provider, model);
    println!("Corpus Size:           {} documents", files.len());
    println!("Queries Evaluated:     {}", queries.len());
    println!("-------------------------------------------------------");
    println!("Avg Indexing Latency:  {:.2} ms / document", avg_indexing_ms);
    println!("Avg Search Latency:    {:.2} ms / query", avg_search_ms);
    println!("-------------------------------------------------------");
    println!("Precision@1 (Hit@1):   {:.2}%", final_hit_at_1 * 10000.0 / 100.0);
    println!("Recall@3 (Hit@3):      {:.2}%", final_hit_at_3 * 10000.0 / 100.0);
    println!("Mean Reciprocal Rank:  {:.4}", final_mrr);
    println!("=======================================================");

    Ok(())
}
