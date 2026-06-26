# PR 4: Persistent Evaluation History Database & Analytics

This phase introduces a dedicated, persistent SQLite database (`evaluation_history.db`) to track all evaluation runs, timings, and search retrieval metrics over time, exposing query flags to analyze history from the CLI and preparing the schema for a future backoffice dashboard UI.

---

## 1. Relocating the Database File

Rather than saving the database inside the developer's temporary `tests/` directory (which is prone to cleanups and git-ignores), the database will be stored in the **Standard Application Local Data Directory**:
* **Windows Path:** `C:\Users\<username>\AppData\Local\com.tsemach.doron-desktop\evaluation_history.db`
* **Linux/WSL Path:** `/home/<username>/.local/share/com.tsemach.doron-desktop/evaluation_history.db`

### Why this location is chosen:
* **UI Accessibility:** It resides right next to the active application database (`documents.db`). The Tauri desktop application can easily access it to display historical search metrics, charts, and latencies in a future **Backoffice Admin UI**.
* **CLI Access:** The standalone Rust `eval` CLI binary can use the same shared path helper function to write evaluation results from the terminal.
* **Durability:** The file is persisted across cargo cleans, compilation refreshes, and codebase re-organizations.

---

## 2. Database Schema

The database will contain two relational tables:

```sql
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at                TEXT NOT NULL,          -- RFC3339 timestamp
    provider              TEXT NOT NULL,          -- e.g. mock, claude, gemini, local, byom
    model                 TEXT NOT NULL,          -- e.g. phi-4, qwen2.5:3b
    algorithm             TEXT NOT NULL,          -- e.g. fts, vector, hybrid, hybrid-rerank
    corpus_size           INTEGER NOT NULL,       -- total documents indexed
    query_count           INTEGER NOT NULL,       -- number of evaluation queries run
    avg_indexing_ms       REAL NOT NULL,          -- avg document index time (milliseconds)
    avg_search_ms         REAL NOT NULL,          -- avg search query time (milliseconds)
    hit_at_1              REAL NOT NULL,          -- Precision@1 ratio (0.0 - 1.0)
    hit_at_3              REAL NOT NULL,          -- Recall@3 ratio (0.0 - 1.0)
    mrr                   REAL NOT NULL           -- Mean Reciprocal Rank (0.0 - 1.0)
);

CREATE TABLE IF NOT EXISTS evaluation_queries (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id                INTEGER NOT NULL,
    query_text            TEXT NOT NULL,
    expected_files        TEXT NOT NULL,          -- JSON list of expected filenames
    returned_files        TEXT NOT NULL,          -- JSON list of top 3 returned filenames
    first_match_rank      INTEGER,                -- Rank of first correct document (1-based, null if not found)
    reciprocal_rank       REAL NOT NULL,          -- Reciprocal rank (e.g. 1/rank, or 0)
    search_latency_ms     REAL NOT NULL,          -- Latency for this specific query
    hit_at_1              INTEGER NOT NULL,       -- 1 if first result was correct, 0 otherwise
    hit_at_3              INTEGER NOT NULL,       -- 1 if correct result in top 3, 0 otherwise
    FOREIGN KEY (run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
);
```

---

## 3. CLI History interrogation Commands

We will implement CLI commands in the `eval` binary to inspect the historical evaluations database:

1. **`--history`**
   - Displays a clean console table of all previous runs showing: Run ID, Date, Provider, Model, Algorithm, Doc Count, MRR, Hit@1, Hit@3, and Latency.
2. **`--history-run <id>`**
   - Displays the query-by-query breakdown of the specific run, showing the query text, expected targets, actual rankings, reciprocal ranks, and latencies.
3. **`--history-compare <id_1> <id_2>`**
   - Renders a side-by-side comparison table of two runs query-by-query, showing changes in Reciprocal Rank ($\Delta$ MRR) and Latency ($\Delta$ Latency) to identify exactly which queries improved or degraded after model or code changes.

---

## 4. Testability & Verification

To verify the database logger and interrogation options:
1. Run the evaluation runner twice with different mock settings:
   ```bash
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin eval -- --provider mock --algorithm fts"
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin eval -- --provider mock --algorithm vector"
   ```
2. Query history to confirm both runs are saved and can be displayed:
   ```bash
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin eval -- --history"
   ```
3. Run comparison to confirm the comparison output prints the changes correctly:
   ```bash
   wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin eval -- --history-compare 1 2"
   ```
