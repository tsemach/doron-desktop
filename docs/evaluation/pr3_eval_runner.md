# PR 3: Standalone Evaluation Runner & AI Corpus Generator

This phase implements the standalone command-line evaluation binary `eval` at `apps/desktop/src-tauri/src/bin/eval.rs` and the test dataset.

---

## 1. Ground Truth Labeled Dataset

The labeled data (reference queries mapped to expected document filenames) resides in a static JSON configuration file in the project repository:
* **Path:** `apps/desktop/src-tauri/tests/evaluation_dataset.json`
* **Format Example:**
  ```json
  [
    {
      "query": "מצא חוזה מכר דירה בתל אביב של רחל לוי",
      "expected_files": ["chozeh_mecher_dira_levy.txt"]
    },
    {
      "query": "הסכם גירושין משותף ירושלים משה אברהם",
      "expected_files": ["heskem_gerushin_abraham.txt"]
    },
    {
      "query": "רשלנות רפואית תביעה נגד בית חולים",
      "expected_files": ["tviah_rashlanut_refuit.txt", "hospital_report.txt"]
    }
  ]
  ```

---

## 2. CLI Options & AI Corpus Generation

The `eval` CLI supports the following arguments:
* `--provider <name>`: `mock` | `claude` | `gemini` | `openai` | `local`
* `--model <name>`: LLM model identifier.
* `--algorithm <algo>`: `fts` | `vector` | `hybrid` | `hybrid-rerank`
* `--corpus-dir <path>`: Path to read/write documents.
* `--generate-corpus`: Programmatically creates 30 basic templates locally.
* `--generate-corpus-ai`: Uses a real online LLM (Claude or Gemini) to generate rich, realistic, synthetic Hebrew legal text files (e.g. drafting mock sales contracts, wills, court arguments) and writes them to the corpus folder to build a large test collection.

---

## 3. Evaluation Metrics Explained

For a set of test queries $Q$, the binary executes each query and computes:

### 3.1 Precision@1 (Hit@1)
* **What it is:** Measures if the very first returned search result (rank 1) is relevant.
* **Formula:**
  $$P@1 = \frac{1}{|Q|} \sum_{q \in Q} \text{Hit}(q)$$
  Where $\text{Hit}(q) = 1$ if the top result is in the `expected_files` list, and $0$ otherwise.

### 3.2 Recall@3 (Hit@3)
* **What it is:** Measures if the expected document is present somewhere in the top 3 search results.
* **Formula:**
  $$R@3 = \frac{1}{|Q|} \sum_{q \in Q} \text{Hit@3}(q)$$
  Where $\text{Hit@3}(q) = 1$ if any expected document appears at rank 1, 2, or 3, and $0$ otherwise.

### 3.3 Mean Reciprocal Rank (MRR)
* **What it is:** Rewards the system for putting correct documents higher in the list.
* **Formula:**
  $$MRR = \frac{1}{|Q|} \sum_{i=1}^{|Q|} \frac{1}{\text{rank}_i}$$
  Where $\text{rank}_i$ is the position (1-based) of the first expected document in the search results. If none of the expected documents appear in the search results, the reciprocal rank is $0.0$.
* **Example:**
  - Query expected document is `doc_A`.
  - Search results are: `[doc_B, doc_C, doc_A, doc_D]`.
  - The correct document is at rank 3.
  - The Reciprocal Rank for this query is $\frac{1}{3} \approx 0.33$.

---

## 4. Testability & Verification

To verify the runner, we will run it under the mock provider (0.0s latency and zero cost):
```bash
wsl --cd ~ zsh -i -c "cd projects/doron-desktop && cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --bin eval -- --provider mock --generate-corpus --algorithm hybrid"
```
Verify that the output displays a clean markdown or plain text report containing:
- Processed document counts
- Average indexing latency per track (LLM track vs. Vector track)
- Average search latency per query
- Precision@1, Recall@3, and MRR scores.
