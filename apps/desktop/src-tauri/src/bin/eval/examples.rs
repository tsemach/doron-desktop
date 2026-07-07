use clap::{Args, Subcommand};

#[derive(Args, Debug, Clone)]
pub struct ExamplesArgs {
    #[command(subcommand)]
    pub category: Option<ExampleCategory>,
}

#[derive(Subcommand, Debug, Clone)]
pub enum ExampleCategory {
    /// Examples for generating the synthetic Hebrew corpus
    Generate,
    /// Examples for running evaluation benchmarks
    Run,
    /// Examples for listing historical evaluation runs
    List,
    /// Examples for displaying detailed results of a specific run
    Show,
    /// Examples for comparing two evaluation runs side-by-side
    Compare,
}

pub async fn execute(args: ExamplesArgs) -> Result<(), String> {
    match args.category {
        None => print_general_examples(),
        Some(ExampleCategory::Generate) => print_generate_examples(),
        Some(ExampleCategory::Run) => print_run_examples(),
        Some(ExampleCategory::List) => print_list_examples(),
        Some(ExampleCategory::Show) => print_show_examples(),
        Some(ExampleCategory::Compare) => print_compare_examples(),
    }
    Ok(())
}

fn print_general_examples() {
    println!(
        r#"
================================================================================
                           EVAL CLI RUNNER EXAMPLES                             
================================================================================
General syntax overview and top commands:

1. Standard Labeled Evaluation Workflow:
   Step A: Generate a synthetic Hebrew corpus locally
     $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --corpus-dir my_test_corpus
   
   Step B: Run FTS evaluation on the corpus (saves as Run #1)
     $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --corpus-dir my_test_corpus --provider mock --algorithm fts
   
   Step C: Run Hybrid evaluation on the same corpus (saves as Run #2)
     $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --corpus-dir my_test_corpus --provider mock --algorithm hybrid
   
   Step D: Compare FTS vs Hybrid accuracy & latency
     $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml compare 1 2

2. Listing run history:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml list

3. Showing details for a specific run directly:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml show 1

4. Get category-specific detailed examples:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml examples generate
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml examples run
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml examples list
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml examples show
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml examples compare
================================================================================
"#
    );
}

fn print_generate_examples() {
    println!(
        r#"
================================================================================
                       CORPUS GENERATION EXAMPLES                               
================================================================================
Generate test documents for search indexing.

1. Generate basic mock corpus (instantly & offline) in the default directory:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate

2. Generate basic mock corpus in a custom output directory:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --corpus-dir ./my_test_docs

3. Generate rich synthetic legal documents via Claude LLM (Sonnet 3.5):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider claude --model claude-3-5-sonnet-20241022 --api-key YOUR_API_KEY --corpus-dir ./ai_docs

4. Generate rich synthetic legal documents via Google Gemini:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider gemini --model gemini-1.5-pro --api-key YOUR_API_KEY --corpus-dir ./gemini_docs

5. Generate rich synthetic legal documents via OpenAI (GPT-4o):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider openai --model gpt-4o --api-key YOUR_API_KEY --corpus-dir ./gpt_docs

6. Generate rich synthetic legal documents via Local Microsoft Phi-4:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider local --model "Phi-4-mini-instruct (3.8B Q4)" --corpus-dir ./phi4_docs

7. Generate rich synthetic legal documents via Local Google Gemma E4B:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider local --model "Gemma 4 E4B (Q4)" --corpus-dir ./gemma_docs

8. Generate rich synthetic legal documents via Local Google Gemma 12B:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider local --model "Gemma 4 12B" --corpus-dir ./gemma12b_docs

9. Generate rich synthetic legal documents via Local Qwen 3B:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml generate --ai --provider local --model "Qwen-2.5-3B-Instruct (Q4)" --corpus-dir ./qwen_docs

Note: Running generation with local models requires your local llama-server to be active on port 10086 (e.g. by running the desktop app in local mode or starting the sidecar).
================================================================================
"#
    );
}

fn print_run_examples() {
    println!(
        r#"
================================================================================
                       BENCHMARK RUNNER EXAMPLES                                
================================================================================
Execute benchmarks against the ground-truth dataset and log results.
The evaluation dataset JSON is automatically autodetected from the corpus directory.

1. Run Full-Text Search (FTS) evaluation (uses LLM metadata only, skips vector embeddings):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider mock --algorithm fts --corpus-dir ./evaluation_corpus

2. Run Vector Retrieval evaluation (uses E5 passage embeddings only, skips LLM metadata):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider mock --algorithm vector --corpus-dir ./evaluation_corpus

3. Run FTS + Vector Hybrid search evaluation:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider mock --algorithm hybrid --corpus-dir ./evaluation_corpus

4. Run Hybrid search with LLM Reranking (mock provider):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider mock --algorithm hybrid-rerank --corpus-dir ./evaluation_corpus

5. Run evaluation using Google Gemini (defaults to gemini-1.5-pro):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider gemini --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

6. Run evaluation using Gemini 1.5 Flash (choosing a specific model):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider gemini --model gemini-1.5-flash --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

7. Run evaluation using Anthropic Claude 3.5 Sonnet:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider claude --model claude-3-5-sonnet-online --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

8. Run evaluation using Anthropic Claude 3.5 Opus:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider claude --model claude-3-5-opus-online --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

9. Run evaluation using Anthropic Claude Sonnet 4.6 (4.x generation):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider claude --model claude-sonnet-4-6 --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

10. Run evaluation using Anthropic Claude Opus 4.6 (4.x generation):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider claude --model claude-opus-4-6 --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

11. Run evaluation using Anthropic Claude Sonnet 5 (latest generation):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider claude --model claude-sonnet-5 --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

12. Run evaluation using Claude 3.5 Haiku (fastest Claude model):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider claude --model claude-3-5-haiku-20241022 --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

13. Run evaluation using OpenAI GPT-4o Mini (choosing a specific model):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider openai --model gpt-4o-mini --api-key YOUR_API_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

14. Run evaluation using Local Microsoft Phi-4:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider local --model "Phi-4-mini-instruct (3.8B Q4)" --algorithm hybrid --corpus-dir ./evaluation_corpus

15. Run evaluation using Local Microsoft Phi-3.5:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider local --model "Phi-3.5-mini-instruct (3.8B Q4)" --algorithm hybrid --corpus-dir ./evaluation_corpus

16. Run evaluation using Local Google Gemma E4B:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider local --model "Gemma 4 E4B (Q4)" --algorithm hybrid --corpus-dir ./evaluation_corpus

17. Run evaluation using Local Google Gemma 12B:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider local --model "Gemma 4 12B" --algorithm hybrid --corpus-dir ./evaluation_corpus

18. Run evaluation using Local Qwen 3B:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider local --model "Qwen-2.5-3B-Instruct (Q4)" --algorithm hybrid --corpus-dir ./evaluation_corpus

19. Run evaluation using a custom BYOM (Bring Your Own Model) or OpenAI-compatible endpoint:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider openai --model my-custom-model --api-key MY_KEY --algorithm hybrid --corpus-dir ./evaluation_corpus

20. Run evaluation on a custom corpus output directory:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml run --provider mock --algorithm hybrid --corpus-dir /path/to/my_custom_corpus
================================================================================
"#
    );
}

fn print_list_examples() {
    println!(
        r#"
================================================================================
                            LIST RUNS EXAMPLES                                  
================================================================================
List and inspect historical evaluation runs.

1. List all historical runs logged in the default database:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml list

2. List all historical runs logged in a custom history database:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml list --db-name my_custom_history.db

3. Detailed query-by-query analysis of a specific run (e.g. Run ID #1):
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml list --run 1

4. Detailed query-by-query analysis of a specific run from a custom database:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml list --run 1 --db-name my_custom_history.db
================================================================================
"#
    );
}

fn print_show_examples() {
    println!(
        r#"
================================================================================
                            SHOW RUN EXAMPLES                                   
================================================================================
Inspect detailed query-by-query analysis and latency metrics for a run.

1. Show detailed query-by-query analysis of a specific run (e.g. Run ID #1) directly:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml show 1

2. Show detailed query-by-query analysis of a specific run from a custom database:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml show 1 --db-name my_custom_history.db
================================================================================
"#
    );
}

fn print_compare_examples() {
    println!(
        r#"
================================================================================
                            COMPARE RUNS EXAMPLES                               
================================================================================
Compare accuracy, recall, MRR, and query latencies of two benchmark runs side-by-side.

1. Compare two runs (e.g. Base Run #1 vs Target Run #2) side-by-side:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml compare 1 2

   Shows rank changes (Δ RR) and speed changes (Δ Latency) with red/green highlights.

2. Compare two runs in a custom history database:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml compare 1 2 --db-name my_custom_history.db

3. Compare and look up runs in a specific custom database path:
   $ cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml compare 1 2 --db-name /home/tsemach/.local/share/com.tsemach.doron-desktop/evaluation_history.db

Query-by-Query Comparison Columns Explained:
* Query: The specific Hebrew search string executed.
* R1 Rank: Search rank of expected document in Run #1 (Base). `1` is top, `FAIL` is not found.
* R2 Rank: Search rank of expected document in Run #2 (Target).
* Δ RR: Difference in reciprocal rank between Run #2 and Run #1.
  - Green positive (e.g. `+0.50`): Search accuracy improved.
  - Red negative: Search accuracy got worse.
  - `0.00`: No change.
* R1 Latency: Query execution time in milliseconds (ms) in Run #1.
* R2 Latency: Query execution time in milliseconds (ms) in Run #2.
* Δ Latency: Speed difference between Run #2 and Run #1 (negative values in green mean Run #2 is faster).
================================================================================
"#
    );
}
