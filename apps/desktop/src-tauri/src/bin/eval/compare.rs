use clap::Args;
use std::collections::HashMap;
use tauri_app_lib::store;

#[derive(Args, Debug, Clone)]
pub struct CompareArgs {
    /// Name/path of the SQLite database to read history from
    #[arg(long, default_value = "evaluation_history.db")]
    pub db_name: String,

    /// First run ID to compare
    pub run_id_1: i64,

    /// Second run ID to compare
    pub run_id_2: i64,
}

struct RunSummary {
    id: i64,
    run_at: String,
    provider: String,
    model: String,
    algorithm: String,
    avg_search_ms: f64,
    hit_at_1: f64,
    hit_at_3: f64,
    mrr: f64,
}

struct QuerySummary {
    query_text: String,
    first_match_rank: Option<i64>,
    reciprocal_rank: f64,
    search_latency_ms: f64,
}

pub async fn execute(args: CompareArgs) -> Result<(), String> {
    let db_path = store::cli_db_path(&args.db_name);
    if !db_path.exists() {
        return Err(format!(
            "History database file {} does not exist.",
            db_path.display()
        ));
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to open history database: {}", e))?;

    let r1 = fetch_run_summary(&conn, args.run_id_1)?;
    let r2 = fetch_run_summary(&conn, args.run_id_2)?;

    let q1_map = fetch_run_queries(&conn, args.run_id_1)?;
    let q2_map = fetch_run_queries(&conn, args.run_id_2)?;

    println!("\n=========================================================================");
    println!(
        "             COMPARISON REPORT: RUN #{} vs RUN #{}                       ",
        r1.id, r2.id
    );
    println!("=========================================================================");
    println!(
        "{:<25} | {:<22} | {:<22}",
        "Metric",
        format!("Run #{} (Base)", r1.id),
        format!("Run #{} (Target)", r2.id)
    );
    println!("{}", "-".repeat(73));
    println!(
        "{:<25} | {:<22} | {:<22}",
        "Timestamp",
        r1.run_at.chars().take(19).collect::<String>(),
        r2.run_at.chars().take(19).collect::<String>()
    );
    println!(
        "{:<25} | {:<22} | {:<22}",
        "Algorithm", r1.algorithm, r2.algorithm
    );
    println!(
        "{:<25} | {:<22} | {:<22}",
        "Provider / Model",
        format!("{}/{}", r1.provider, r1.model),
        format!("{}/{}", r2.provider, r2.model)
    );
    println!(
        "{:<25} | {:<22.2} ms | {:<22.2} ms",
        "Avg Search Latency", r1.avg_search_ms, r2.avg_search_ms
    );
    println!(
        "{:<25} | {:<22.2}% | {:<22.2}%",
        "Precision@1 (Hit@1)",
        r1.hit_at_1 * 100.0,
        r2.hit_at_1 * 100.0
    );
    println!(
        "{:<25} | {:<22.2}% | {:<22.2}%",
        "Recall@3 (Hit@3)",
        r1.hit_at_3 * 100.0,
        r2.hit_at_3 * 100.0
    );
    println!(
        "{:<25} | {:<22.4} | {:<22.4}",
        "Mean Reciprocal Rank", r1.mrr, r2.mrr
    );
    println!("=========================================================================");

    println!("\n-- Query-by-Query Comparison --");
    println!(
        "{:<50} | {:<8} | {:<8} | {:<10} | {:<10} | {:<10} | {:<10}",
        "Query", "R1 Rank", "R2 Rank", "Δ RR", "R1 Latency", "R2 Latency", "Δ Latency"
    );
    println!("{}", "-".repeat(123));

    let mut queries: Vec<&String> = q1_map.keys().collect();
    queries.sort();

    for query in queries {
        if let (Some(q1), Some(q2)) = (q1_map.get(query), q2_map.get(query)) {
            let r1_rank_str = q1
                .first_match_rank
                .map(|r| r.to_string())
                .unwrap_or_else(|| "FAIL".to_string());
            let r2_rank_str = q2
                .first_match_rank
                .map(|r| r.to_string())
                .unwrap_or_else(|| "FAIL".to_string());

            let delta_rr = q2.reciprocal_rank - q1.reciprocal_rank;
            let delta_rr_str = if delta_rr > 0.0 {
                format!("\x1b[32m+{:.2}\x1b[0m", delta_rr)
            } else if delta_rr < 0.0 {
                format!("\x1b[31m{:.2}\x1b[0m", delta_rr)
            } else {
                "0.00".to_string()
            };

            let delta_lat = q2.search_latency_ms - q1.search_latency_ms;
            let delta_lat_str = if delta_lat < 0.0 {
                format!("\x1b[32m{:.1}ms\x1b[0m", delta_lat)
            } else if delta_lat > 0.0 {
                format!("\x1b[31m+{:.1}ms\x1b[0m", delta_lat)
            } else {
                "0.0ms".to_string()
            };

            println!(
                "{:<50} | {:<8} | {:<8} | {:<19} | {:<10.1} | {:<10.1} | {:<19}",
                if query.chars().count() > 47 {
                    format!("{}...", query.chars().take(44).collect::<String>())
                } else {
                    query.clone()
                },
                r1_rank_str,
                r2_rank_str,
                delta_rr_str,
                q1.search_latency_ms,
                q2.search_latency_ms,
                delta_lat_str
            );
        }
    }
    println!();
    Ok(())
}

fn fetch_run_summary(conn: &rusqlite::Connection, id: i64) -> Result<RunSummary, String> {
    conn.query_row(
        "SELECT run_at, provider, model, algorithm, avg_search_ms, hit_at_1, hit_at_3, mrr FROM evaluation_runs WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(RunSummary {
                id,
                run_at: row.get(0)?,
                provider: row.get(1)?,
                model: row.get(2)?,
                algorithm: row.get(3)?,
                avg_search_ms: row.get(4)?,
                hit_at_1: row.get(5)?,
                hit_at_3: row.get(6)?,
                mrr: row.get(7)?,
            })
        },
    ).map_err(|_| format!("Evaluation run #{} not found in history database.", id))
}

fn fetch_run_queries(
    conn: &rusqlite::Connection,
    run_id: i64,
) -> Result<HashMap<String, QuerySummary>, String> {
    let mut stmt = conn
        .prepare(
            "
        SELECT query_text, first_match_rank, reciprocal_rank, search_latency_ms
        FROM evaluation_queries
        WHERE run_id = ?1
    ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([run_id], |row| {
            Ok(QuerySummary {
                query_text: row.get(0)?,
                first_match_rank: row.get(1)?,
                reciprocal_rank: row.get(2)?,
                search_latency_ms: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for q in rows.flatten() {
        map.insert(q.query_text.clone(), q);
    }
    Ok(map)
}
