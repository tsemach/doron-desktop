use clap::Args;

#[derive(Args, Debug, Clone)]
pub struct ReadmeArgs {}

pub async fn execute(_args: ReadmeArgs) -> Result<(), String> {
    print_readme();
    Ok(())
}

fn print_readme() {
    println!(
        r#"
# Document Scan, Index, and Search Evaluation Pipeline

This command-line interface (CLI) tool facilitates rapid, reproducible, and cloud-agnostic benchmarking of document indexing and search retrieval algorithms.

---

## 1. Overview of Retrieval Tracks

To evaluate both speed and search quality independently, the backend is split into two tracks:
* **LLM Metadata Track (FTS)**: 
  Extracts document metadata (title, summary, date, authors, keywords) from raw OCR text using an LLM. Results are stored in standard SQLite text columns indexed by a virtual FTS5 table.
* **Vector Embedding Track**: 
  Splits text into chunks, generates dense vector representations (e.g. E5-small), and stores them as binary blobs. Search matches are calculated via cosine similarity.

---

## 2. Evaluation Metrics Explained

### 2.1 Precision@1 (Hit@1)
* **Definition**: The proportion of test queries where the correct target document is ranked as the #1 search result.
* **Formula**:
  P@1 = (1 / |Q|) * Sum(Hit_q)
  where Hit_q = 1 if top result is in expected target list, 0 otherwise.

### 2.2 Recall@3 (Hit@3)
* **Definition**: The proportion of test queries where a correct target document is returned anywhere in the top 3 matches.
* **Formula**:
  R@3 = (1 / |Q|) * Sum(Hit3_q)
  where Hit3_q = 1 if expected document appears at rank 1, 2, or 3, 0 otherwise.

### 2.3 Mean Reciprocal Rank (MRR)
* **Definition**: Measures how high up the search list correct matches are returned, calculating the average of the reciprocal ranks of the first correct document.
* **Formula**:
  MRR = (1 / |Q|) * Sum(1 / rank_q)
  where rank_q is the 1-based index of the first expected document (0.0 if not found).
* **Examples**:
  - Expected target found at rank 1: RR = 1 / 1 = 1.00
  - Expected target found at rank 2: RR = 1 / 2 = 0.50
  - Expected target found at rank 3: RR = 1 / 3 = 0.33
  - Expected target not in top results: RR = 0.00

---

## 3. History & Compare Analytics

All evaluation results are stored in `evaluation_history.db` within the application's standard local data folder:
* **Windows**: `AppData\Local\com.tsemach.doron-desktop\evaluation_history.db`
* **Linux/WSL**: `~/.local/share/com.tsemach.doron-desktop/evaluation_history.db`

Commands:
* `eval list`: Lists summary scores of all historical runs.
* `eval show <ID>`: Displays query-by-query ranks and latencies for that run.
* `eval compare <ID_1> <ID_2>`: Performs a side-by-side delta comparison of run scores and latencies (highlighting regressions in red/green).

---

## 4. Query-by-Query Comparison Columns Explained

* **Query**: The specific Hebrew search string executed.
* **R1 Rank**: The search rank where the expected document was found in Run #1 (Base). `1` means top result, `FAIL` means not found.
* **R2 Rank**: The search rank where the expected document was found in Run #2 (Target).
* **Δ RR (Delta Reciprocal Rank)**: The difference in search accuracy between Run #2 and Run #1.
  - Green positive (e.g. `+0.50`): Search accuracy improved.
  - Red negative: Search accuracy got worse.
  - `0.00`: No change.
* **R1 Latency**: Query execution time in milliseconds (ms) in Run #1.
* **R2 Latency**: Query execution time in milliseconds (ms) in Run #2.
* **Δ Latency**: Speed difference between Run #2 and Run #1 (negative values in green mean Run #2 is faster).
"#
    );
}
