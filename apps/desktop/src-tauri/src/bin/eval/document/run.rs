use clap::Args;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::io::Write;
use std::time::Instant;
use tauri_app_lib::{
    indexer::{index_file_core, IndexOptions},
    llm::llm_provider::{get_active_provider, ProviderConfig},
    query::{query_search_documents_core, SearchOptions},
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

struct QueryEvalResult {
    query_text: String,
    expected_files: Vec<String>,
    returned_files: Vec<String>,
    first_match_rank: Option<i64>,
    reciprocal_rank: f64,
    search_latency_ms: f64,
    hit_at_1: i32,
    hit_at_3: i32,
}

struct EvaluationSummary {
    avg_search_ms: f64,
    hit_at_1: f64,
    hit_at_3: f64,
    mrr: f64,
}

fn load_evaluation_dataset(corpus_dir: &str) -> Result<Vec<LabeledQuery>, String> {
    let corpus_path = Path::new(corpus_dir);
    if !corpus_path.exists() || !corpus_path.is_dir() {
        return Err(format!(
            "Corpus directory '{}' does not exist. Please run 'eval generate' first.",
            corpus_dir
        ));
    }

    let dataset_file = {
        let path_in_corpus = corpus_path.join("evaluation_dataset.json");
        if path_in_corpus.exists() {
            path_in_corpus
        } else {
            PathBuf::from("tests/evaluation_dataset.json")
        }
    };

    if !dataset_file.exists() {
        return Err(format!(
            "Dataset JSON file '{}' does not exist.",
            dataset_file.display()
        ));
    }

    let dataset_data = fs::read_to_string(&dataset_file)
        .map_err(|e| format!("Failed to read dataset file: {e}"))?;
    let queries: Vec<LabeledQuery> = serde_json::from_str(&dataset_data)
        .map_err(|e| format!("Failed to parse dataset JSON: {e}"))?;

    if queries.is_empty() {
        return Err("Labeled query dataset is empty.".to_string());
    }

    Ok(queries)
}

fn init_index_database(db_name: &str) -> Result<PathBuf, String> {
    let db_path = store::cli_db_path(db_name);
    if db_path.exists() {
        let _ = fs::remove_file(&db_path);
    }

    println!(
        "Initializing evaluation index database at: {}...",
        db_path.display()
    );
    // Create/initialize connection and migrations
    let _conn = store::open_db_by_path(&db_path)?;
    Ok(db_path)
}

fn scan_corpus_files(corpus_path: &Path) -> Result<Vec<PathBuf>, String> {
    let files: Vec<PathBuf> = walkdir::WalkDir::new(corpus_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| {
            p.file_name()
                .map(|n| n != "evaluation_dataset.json")
                .unwrap_or(true)
        })
        .collect();

    if files.is_empty() {
        return Err(format!(
            "No files found in corpus directory '{}'",
            corpus_path.display()
        ));
    }

    Ok(files)
}

async fn setup_local_sidecar(provider: &str, model: &str) -> Result<crate::sidecar::SidecarGuard, String> {
    let mut sidecar_guard = crate::sidecar::SidecarGuard { child: None };

    if provider.to_lowercase() == "local" {
        println!("Initializing local model sidecar for evaluation...");

        // Kill any existing running local server to release the port
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("pkill")
                .arg("-f")
                .arg("llama-server")
                .status();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(&["/F", "/IM", "llama-server.exe"])
                .status();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        let sidecar_path = crate::sidecar::get_cli_sidecar_path()?;
        let model_file = tauri_app_lib::llm::get_model_filename(model)?;
        let model_path = store::cli_app_data_dir().join("models").join(model_file);

        if !model_path.exists() {
            return Err(format!(
                "Local model not found at {:?}. Please download it via the desktop application settings first.",
                model_path
            ));
        }

        let port = 10086;
        let mut cmd = std::process::Command::new(&sidecar_path);
        cmd.arg("--model")
            .arg(&model_path)
            .arg("--port")
            .arg(port.to_string())
            .arg("--threads")
            .arg("4")
            .arg("-c")
            .arg("8192")
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--no-cache-prompt");

        let template = if model.to_lowercase().contains("qwen") {
            "chatml"
        } else if model.to_lowercase().contains("gemma") {
            "gemma"
        } else if model.to_lowercase().contains("phi-4") {
            "phi4"
        } else {
            "chatml"
        };
        cmd.arg("--chat-template").arg(template);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let app_data_dir = store::cli_app_data_dir();
        let log_file_path = app_data_dir.join("llama_sidecar.log");
        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&log_file_path)
            .map_err(|e| format!("Failed to create log file {:?}: {}", log_file_path, e))?;

        cmd.stdout(log_file.try_clone().map_err(|e| e.to_string())?);
        cmd.stderr(log_file);

        println!("Spawning local sidecar (logs redirected to {:?})", log_file_path);
        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn local sidecar: {}", e))?;
        sidecar_guard.child = Some(child);

        // Poll /health endpoint up to 120 seconds (240 * 500ms) to allow the model to load into memory
        let client = reqwest::Client::new();
        let health_url = format!("http://localhost:{}/health", port);
        let mut responsive = false;
        for _ in 0..240 {
            if client
                .get(&health_url)
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false)
            {
                responsive = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        if !responsive {
            return Err("Local sidecar failed to become responsive within timeout.".to_string());
        }
        println!("Local model sidecar is active and ready.");
    }

    Ok(sidecar_guard)
}

async fn index_documents(
    db_path: &Path,
    provider: &tauri_app_lib::llm::llm_provider::LlmProvider,
    files: &[PathBuf],
    algorithm: &str,
    is_local: bool,
) -> Result<(usize, usize, f64), String> {
    // Configure indexing tracks based on target algorithm
    let run_llm_metadata = match algorithm {
        "vector" => false,
        _ => !is_local,
    };
    let run_vector_embeddings = match algorithm {
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

    for file in files {
        let current_index = indexed_count + failed_count + 1;
        let file_name = file.file_name().and_then(|n| n.to_str()).unwrap_or("");
        print!(
            "\rIndexing document \x1b[36m{}/{}\x1b[0m (\x1b[36m{:.0}%\x1b[0m): {} \x1b[K",
            current_index,
            files.len(),
            (current_index as f64 / files.len() as f64) * 100.0,
            file_name
        );
        let _ = std::io::stdout().flush();

        let start = Instant::now();
        match index_file_core(db_path, provider, file, &index_options, true).await {
            Ok(_) => {
                total_indexing_time += start.elapsed();
                indexed_count += 1;
            }
            Err(e) => {
                eprintln!("\nWarning: Failed to index file {}: {}", file.display(), e);
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
        "\r\x1b[K\x1b[32mIndexing Complete!\x1b[0m Indexed: {}, Failed: {}. Avg latency per file: {:.2}ms",
        indexed_count, failed_count, avg_indexing_ms
    );

    Ok((indexed_count, failed_count, avg_indexing_ms))
}

async fn evaluate_queries(
    db_path: &Path,
    provider: &tauri_app_lib::llm::llm_provider::LlmProvider,
    queries: &[LabeledQuery],
    algorithm: &str,
) -> Result<(Vec<QueryEvalResult>, EvaluationSummary), String> {
    println!(
        "Running {} evaluation queries using algorithm: '{}'...",
        queries.len(),
        algorithm
    );

    let use_llm_query_analysis = match algorithm {
        "fts" | "vector" => false,
        _ => true,
    };
    let use_llm_rerank = algorithm == "hybrid-rerank";
    let search_options = SearchOptions {
        use_llm_query_analysis,
        use_llm_rerank,
    };

    let mut total_search_time = std::time::Duration::default();
    let mut hit_at_1_sum = 0;
    let mut hit_at_3_sum = 0;
    let mut mrr_sum = 0.0;

    let h_query = format!("{:<50}", "Query");
    let h_top = format!("{:<30}", "Top File Returned");
    let h_r3 = format!("{:<5}", "R@3");
    let h_p1 = format!("{:<5}", "P@1");
    let h_latency = format!("{:<10}", "Latency");
    println!(
        "\n\u{200e}{} \u{200e}| {} \u{200e}| {} \u{200e}| {} \u{200e}| {}",
        h_query, h_top, h_r3, h_p1, h_latency
    );
    println!("{}", "-".repeat(114));

    let mut query_results = Vec::new();

    for q in queries {
        let start = Instant::now();
        let search_results =
            match query_search_documents_core(db_path, provider, &q.query, 5, &search_options, None, None).await {
                Ok(results) => results,
                Err(e) => {
                    eprintln!("Error executing query '{}': {}", q.query, e);
                    continue;
                }
            };
        let search_duration = start.elapsed();
        total_search_time += search_duration;

        let returned_filenames: Vec<String> =
            search_results.iter().map(|r| r.file_name.clone()).collect();

        // Calculate Hit@1 (Precision@1)
        let hit_at_1 = if !returned_filenames.is_empty()
            && q.expected_files.contains(&returned_filenames[0])
        {
            1
        } else {
            0
        };
        hit_at_1_sum += hit_at_1;

        // Calculate Hit@3 (Recall@3)
        let hit_at_3 = if returned_filenames
            .iter()
            .take(3)
            .any(|f| q.expected_files.contains(f))
        {
            1
        } else {
            0
        };
        hit_at_3_sum += hit_at_3;

        // Calculate Reciprocal Rank (RR)
        let mut rr = 0.0;
        let mut first_match_rank = None;
        for (idx, filename) in returned_filenames.iter().enumerate() {
            if q.expected_files.contains(filename) {
                rr = 1.0 / (idx + 1) as f64;
                first_match_rank = Some((idx + 1) as i64);
                break;
            }
        }
        mrr_sum += rr;

        query_results.push(QueryEvalResult {
            query_text: q.query.clone(),
            expected_files: q.expected_files.clone(),
            returned_files: returned_filenames.clone(),
            first_match_rank,
            reciprocal_rank: rr,
            search_latency_ms: search_duration.as_secs_f64() * 1000.0,
            hit_at_1,
            hit_at_3,
        });

        let top_returned = returned_filenames
            .first()
            .cloned()
            .unwrap_or_else(|| "NONE".to_string());

        let p1_str = if hit_at_1 == 1 { "PASS" } else { "FAIL" };
        let r3_str = if hit_at_3 == 1 { "PASS" } else { "FAIL" };
        let p1_padded = format!("{:<5}", p1_str);
        let r3_padded = format!("{:<5}", r3_str);
        let p1_colored = if hit_at_1 == 1 { format!("\x1b[32m{}\x1b[0m", p1_padded) } else { format!("\x1b[31m{}\x1b[0m", p1_padded) };
        let r3_colored = if hit_at_3 == 1 { format!("\x1b[32m{}\x1b[0m", r3_padded) } else { format!("\x1b[31m{}\x1b[0m", r3_padded) };

        let latency_str = format!("{:.2}ms", search_duration.as_secs_f64() * 1000.0);
        let latency_padded = format!("{:<10}", latency_str);

        let top_returned_trimmed = if top_returned.len() > 30 {
            format!("{}...", &top_returned[..27])
        } else {
            top_returned
        };
        let top_returned_padded = format!("{:<30}", top_returned_trimmed);

        let clean_query = if q.query.chars().count() > 47 {
            format!("{}...", q.query.chars().take(44).collect::<String>())
        } else {
            q.query.clone()
        };
        let query_len = clean_query.chars().count();
        let query_padded = if query_len < 50 {
            format!("{}{}", clean_query, " ".repeat(50 - query_len))
        } else {
            clean_query
        };

        println!(
            "\u{200e}{} \u{200e}| {} \u{200e}| {} \u{200e}| {} \u{200e}| {}",
            query_padded,
            top_returned_padded,
            r3_colored,
            p1_colored,
            latency_padded
        );
    }

    let avg_search_ms = (total_search_time.as_secs_f64() * 1000.0) / queries.len() as f64;
    let final_hit_at_1 = hit_at_1_sum as f64 / queries.len() as f64;
    let final_hit_at_3 = hit_at_3_sum as f64 / queries.len() as f64;
    let final_mrr = mrr_sum / queries.len() as f64;

    Ok((
        query_results,
        EvaluationSummary {
            avg_search_ms,
            hit_at_1: final_hit_at_1,
            hit_at_3: final_hit_at_3,
            mrr: final_mrr,
        },
    ))
}

fn print_report(
    algorithm: &str,
    provider: &str,
    model: &str,
    files_count: usize,
    queries_count: usize,
    avg_indexing_ms: f64,
    summary: &EvaluationSummary,
) {
    println!("\n=======================================================");
    println!("               EVALUATION REPORT SUMMARY               ");
    println!("=======================================================");
    println!("Algorithm:             {}", algorithm);
    println!("Provider / Model:      {} / {}", provider, model);
    println!("Corpus Size:           {} documents", files_count);
    println!("Queries Evaluated:     {}", queries_count);
    println!("-------------------------------------------------------");
    println!(
        "Avg Indexing Latency:  {:.2} ms / document",
        avg_indexing_ms
    );
    println!("Avg Search Latency:    {:.2} ms / query", summary.avg_search_ms);
    println!("-------------------------------------------------------");
    println!(
        "Precision@1 (Hit@1):   {:.2}%",
        summary.hit_at_1 * 10000.0 / 100.0
    );
    println!(
        "Recall@3 (Hit@3):      {:.2}%",
        summary.hit_at_3 * 10000.0 / 100.0
    );
    println!("Mean Reciprocal Rank:  {:.4}", summary.mrr);
    println!("=======================================================");
}

fn log_run_to_history(
    args: &RunArgs,
    model: &str,
    files_count: usize,
    queries_count: usize,
    avg_indexing_ms: f64,
    summary: &EvaluationSummary,
    query_results: Vec<QueryEvalResult>,
) {
    let history_db_path = store::cli_db_path("evaluation_history.db");
    match rusqlite::Connection::open(&history_db_path) {
        Ok(history_conn) => {
            if let Err(e) = init_history_db(&history_conn) {
                eprintln!("Warning: Failed to initialize history DB schema: {}", e);
            } else {
                let run_at = chrono::Utc::now().to_rfc3339();
                let insert_run = history_conn.execute(
                    "INSERT INTO evaluation_runs (run_at, provider, model, algorithm, corpus_size, query_count, avg_indexing_ms, avg_search_ms, hit_at_1, hit_at_3, mrr) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    rusqlite::params![
                        run_at,
                        args.provider,
                        model,
                        args.algorithm,
                        files_count as i64,
                        queries_count as i64,
                        avg_indexing_ms,
                        summary.avg_search_ms,
                        summary.hit_at_1,
                        summary.hit_at_3,
                        summary.mrr,
                    ],
                );

                match insert_run {
                    Ok(_) => {
                        let run_id = history_conn.last_insert_rowid();
                        for qr in query_results {
                            let expected_json = serde_json::to_string(&qr.expected_files)
                                .unwrap_or_else(|_| "[]".to_string());
                            let returned_json = serde_json::to_string(&qr.returned_files)
                                .unwrap_or_else(|_| "[]".to_string());
                            let _ = history_conn.execute(
                                "INSERT INTO evaluation_queries (run_id, query_text, expected_files, returned_files, first_match_rank, reciprocal_rank, search_latency_ms, hit_at_1, hit_at_3) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                                rusqlite::params![
                                    run_id,
                                    qr.query_text,
                                    expected_json,
                                    returned_json,
                                    qr.first_match_rank,
                                    qr.reciprocal_rank,
                                    qr.search_latency_ms,
                                    qr.hit_at_1,
                                    qr.hit_at_3,
                                ],
                            );
                        }
                        println!("\x1b[32mSuccess!\x1b[0m Logged evaluation run #{} to history database. Use 'eval list' to see all runs.", run_id);
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to insert run into history DB: {}", e);
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Warning: Failed to open history DB: {}", e);
        }
    }
}

pub async fn execute(args: RunArgs) -> Result<(), String> {
    let _guard = tauri_app_lib::power::SleepPreventionGuard::new(true);
    let corpus_path = Path::new(&args.corpus_dir);

    let queries = load_evaluation_dataset(&args.corpus_dir)?;
    let db_path = init_index_database(&args.db_name)?;
    let files = scan_corpus_files(corpus_path)?;

    let model = args
        .model
        .clone()
        .unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    let _sidecar_guard = setup_local_sidecar(&args.provider, &model).await?;

    let api_key = args.api_key.clone().unwrap_or_default();
    let provider = get_active_provider(ProviderConfig {
        provider_type: args.provider.clone(),
        api_key,
        model: model.clone(),
        base_url: if args.provider.to_lowercase() == "local" {
            Some("http://localhost:10086/v1".to_string())
        } else {
            None
        },
    });

    let is_local = args.provider.to_lowercase() == "local";
    let (_indexed_count, _failed_count, avg_indexing_ms) = index_documents(
        &db_path,
        &provider,
        &files,
        &args.algorithm,
        is_local,
    )
    .await?;

    let (query_results, summary) = evaluate_queries(
        &db_path,
        &provider,
        &queries,
        &args.algorithm,
    )
    .await?;

    print_report(
        &args.algorithm,
        &args.provider,
        &model,
        files.len(),
        queries.len(),
        avg_indexing_ms,
        &summary,
    );

    log_run_to_history(
        &args,
        &model,
        files.len(),
        queries.len(),
        avg_indexing_ms,
        &summary,
        query_results,
    );

    Ok(())
}

fn init_history_db(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS evaluation_runs (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            run_at                TEXT NOT NULL,
            provider              TEXT NOT NULL,
            model                 TEXT NOT NULL,
            algorithm             TEXT NOT NULL,
            corpus_size           INTEGER NOT NULL,
            query_count           INTEGER NOT NULL,
            avg_indexing_ms       REAL NOT NULL,
            avg_search_ms         REAL NOT NULL,
            hit_at_1              REAL NOT NULL,
            hit_at_3              REAL NOT NULL,
            mrr                   REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS evaluation_queries (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id                INTEGER NOT NULL,
            query_text            TEXT NOT NULL,
            expected_files        TEXT NOT NULL,
            returned_files        TEXT NOT NULL,
            first_match_rank      INTEGER,
            reciprocal_rank       REAL NOT NULL,
            search_latency_ms     REAL NOT NULL,
            hit_at_1              INTEGER NOT NULL,
            hit_at_3              INTEGER NOT NULL,
            FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
        );
    ",
    )?;
    Ok(())
}


