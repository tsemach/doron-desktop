use clap::Args;
use tauri_app_lib::store;

#[derive(Args, Debug, Clone)]
pub struct ListArgs {
    /// Name/path of the SQLite database to read history from
    #[arg(long, default_value = "evaluation_history.db")]
    pub db_name: String,

    /// Detail query-by-query breakdown for a specific run ID
    #[arg(long)]
    pub run: Option<i64>,
}

pub async fn execute(args: ListArgs) -> Result<(), String> {
    let db_path = store::cli_db_path(&args.db_name);
    if !db_path.exists() {
        println!(
            "No evaluation history database found at {}. Please run an evaluation first.",
            db_path.display()
        );
        return Ok(());
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open history database: {}", e))?;

    match args.run {
        Some(run_id) => show_run_details(&conn, run_id),
        None => list_runs(&conn),
    }
}

fn list_runs(conn: &rusqlite::Connection) -> Result<(), String> {
    let mut stmt = conn.prepare("
        SELECT id, run_at, provider, model, algorithm, corpus_size, query_count, avg_indexing_ms, avg_search_ms, hit_at_1, hit_at_3, mrr
        FROM evaluation_runs
        ORDER BY id DESC
    ").map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, f64>(7)?,
                row.get::<_, f64>(8)?,
                row.get::<_, f64>(9)?,
                row.get::<_, f64>(10)?,
                row.get::<_, f64>(11)?,
            ))
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    println!("\n{:<4} | {:<20} | {:<8} | {:<30} | {:<12} | {:<6} | {:<5} | {:<8} | {:<8} | {:<6} | {:<6} | {:<6}",
             "ID", "Timestamp", "Provider", "Model", "Algorithm", "Corpus", "Query", "Idx (ms)", "Sch (ms)", "P@1", "R@3", "MRR");
    println!("{}", "-".repeat(152));

    let mut count = 0;
    for row in rows.flatten() {
        let (
            id,
            run_at,
            provider,
            model,
            algorithm,
            corpus_size,
            query_count,
            avg_idx,
            avg_sch,
            p1,
            r3,
            mrr,
        ) = row;
        let short_date = if run_at.len() > 19 {
            &run_at[..19]
        } else {
            &run_at
        };

        println!("{:<4} | {:<20} | {:<8} | {:<30} | {:<12} | {:<6} | {:<5} | {:<8.2} | {:<8.2} | {:<5.1}% | {:<5.1}% | {:<6.4}",
                 id, short_date, provider,
                 if model.len() > 30 { format!("{}...", &model[..27]) } else { model },
                 algorithm, corpus_size, query_count, avg_idx, avg_sch,
                 p1 * 100.0, r3 * 100.0, mrr);
        count += 1;
    }

    if count == 0 {
        println!("No runs found in the database. Run an evaluation first.");
    }
    println!();
    Ok(())
}

pub fn show_run_details(conn: &rusqlite::Connection, run_id: i64) -> Result<(), String> {
    let run_summary = conn.query_row(
        "SELECT run_at, provider, model, algorithm, corpus_size, query_count, avg_indexing_ms, avg_search_ms, hit_at_1, hit_at_3, mrr FROM evaluation_runs WHERE id = ?1",
        rusqlite::params![run_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, f64>(7)?,
                row.get::<_, f64>(8)?,
                row.get::<_, f64>(9)?,
                row.get::<_, f64>(10)?,
            ))
        },
    );

    let (
        run_at,
        provider,
        model,
        algorithm,
        corpus_size,
        query_count,
        avg_idx,
        avg_sch,
        p1,
        r3,
        mrr,
    ) = match run_summary {
        Ok(vals) => vals,
        Err(_) => return Err(format!("Evaluation run #{} not found.", run_id)),
    };

    println!("\n=======================================================");
    println!(
        "             DETAILS FOR EVALUATION RUN #{}            ",
        run_id
    );
    println!("=======================================================");
    println!("Timestamp:             {}", run_at);
    println!("Algorithm:             {}", algorithm);
    println!("Provider / Model:      {} / {}", provider, model);
    println!("Corpus Size:           {} documents", corpus_size);
    println!("Queries Evaluated:     {}", query_count);
    println!("-------------------------------------------------------");
    println!("Avg Indexing Latency:  {:.2} ms", avg_idx);
    println!("Avg Search Latency:    {:.2} ms", avg_sch);
    println!("-------------------------------------------------------");
    println!("Precision@1 (Hit@1):   {:.2}%", p1 * 100.0);
    println!("Recall@3 (Hit@3):      {:.2}%", r3 * 100.0);
    println!("Mean Reciprocal Rank:  {:.4}", mrr);
    println!("=======================================================");

    let mut stmt = conn.prepare("
        SELECT query_text, expected_files, returned_files, first_match_rank, reciprocal_rank, search_latency_ms, hit_at_1, hit_at_3
        FROM evaluation_queries
        WHERE run_id = ?1
    ").map_err(|e| format!("Failed to prepare query detail select: {}", e))?;

    let rows = stmt
        .query_map([run_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
            ))
        })
        .map_err(|e| format!("Query details fetch failed: {}", e))?;

    println!("\n-- Query Details --");
    println!(
        "{:<55} | {:<25} | {:<25} | {:<5} | {:<5} | {:<8}",
        "Query", "Expected Files", "Returned Files", "Rank", "RR", "Latency"
    );
    println!("{}", "-".repeat(137));

    for row in rows.flatten() {
        let (query, expected_json, returned_json, rank, rr, latency, _h1, _h3) = row;

        let expected: Vec<String> = serde_json::from_str(&expected_json).unwrap_or_default();
        let returned: Vec<String> = serde_json::from_str(&returned_json).unwrap_or_default();

        let expected_str = expected.join(", ");
        let returned_str = returned.join(", ");

        println!(
            "{:<55} | {:<25} | {:<25} | {:<5} | {:<5.2} | {:.2}ms",
            if query.chars().count() > 50 {
                format!("{}...", query.chars().take(47).collect::<String>())
            } else {
                query.clone()
            },
            if expected_str.len() > 22 {
                format!("{}...", &expected_str[..19])
            } else {
                expected_str
            },
            if returned_str.len() > 22 {
                format!("{}...", &returned_str[..19])
            } else {
                returned_str
            },
            rank.map(|r| r.to_string())
                .unwrap_or_else(|| "FAIL".to_string()),
            rr,
            latency
        );
    }
    println!();
    Ok(())
}
