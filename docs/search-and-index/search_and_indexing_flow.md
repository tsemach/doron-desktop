Applying rules core-development.md, development-guidelines.mdHere is how the three elements—**`doc_type` (pre-filter)**, **FTS (keywords)**, and **Vector (semantics)**—fit together in the search execution flow:

---

### Step 1: Pre-filtering using `doc_type` (The Gatekeeper)
Before any searching happens, the system resolves the `doc_type` extracted by the LLM. 
* It queries SQL to get a set of allowed document IDs (let's call them `filter_ids`). 
* *Example*: If the LLM classifies the query as a `contract`, `filter_ids` becomes: `[4, 6, 17, 23]` (only the contracts).

---

### Step 2: FTS Search (Runs on the filtered IDs)
The keyword index is queried, but **only searches within the allowed IDs** from Step 1.
* Under the hood, the FTS SQL query does:
  ```sql
  SELECT rowid FROM documents_fts 
  WHERE documents_fts MATCH 'שכירות' AND rowid IN (4, 6, 17, 23);
  ```
* This returns candidate files with their **keyword matching scores** (e.g., `File #6: Score 15.0`).

---

### Step 3: Vector Search (Runs on the filtered IDs in parallel)
In parallel, the vector search runs, also **restricted to the allowed IDs** from Step 1.
* It calculates the cosine similarity between your query embedding and the chunks of files `[4, 6, 17, 23]`.
* This returns candidate files with their **semantic similarity scores** (e.g., `File #6: Score 0.82`, `File #17: Score 0.76`).

---

### Step 4: The Merge (Combining FTS + Vector)
Finally, the engine merges the candidates and calculates their combined scores:
$$\text{Combined Score} = \text{Vector Score} + \frac{\text{FTS Score}}{200}$$

* **Document #6** (matched both FTS keywords and Vector): Gets a high combined score ($0.82 + 0.075 = 0.895$).
* **Document #17** (matched only Vector, no keywords): Still retained because its semantic score is high ($0.76$).
* **Document #9** (not in the `contract` list `[4, 6, 17, 23]`): Was completely ignored from the start because of the Step 1 pre-filter.