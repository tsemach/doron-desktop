# Document metadata indexer

Index your Word, PDF, and Excel files into SQLite using Claude, then search
them from Claude Desktop with plain-English questions.

---

## Requirements

```bash
pip install anthropic python-docx pdfplumber openpyxl
npm install -g @modelcontextprotocol/server-sqlite
```

You also need an **Anthropic API key** from https://console.anthropic.com

---

## Step 1 — Index your documents

```bash
export ANTHROPIC_API_KEY=sk-ant-...

python index_documents.py --folder /path/to/your/documents
```

This scans the folder recursively for `.docx`, `.pdf`, `.xlsx`, and `.xls`
files, sends each one to Claude to extract metadata, and stores everything in
`documents.db` (created in the current directory).

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--folder` | required | Folder to scan (recursive) |
| `--db` | `documents.db` | SQLite output file |
| `--api-key` | `$ANTHROPIC_API_KEY` | Anthropic API key |
| `--model` | `claude-sonnet-4-6` | Claude model to use |
| `--reindex` | off | Re-process already-indexed files |
| `--delay` | `0.5` | Seconds between API calls |

### Cost estimate

Each document costs roughly 1 000–3 000 input tokens depending on size.
At Sonnet 4.6 pricing (~$3/M input tokens), indexing 1 000 documents costs
roughly $3–9.

---

## Step 2 — Connect Claude Desktop

1. Open (or create) your Claude Desktop config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add (or merge) this block, replacing the database path:

```json
{
  "mcpServers": {
    "documents-db": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sqlite",
        "/absolute/path/to/documents.db"
      ]
    }
  }
}
```

3. Restart Claude Desktop.

---

## Step 3 — Search

Just ask Claude Desktop in plain English:

- *"List all contracts in the database"*
- *"Find documents written in Hebrew"*
- *"Show me all reports from 2024"*
- *"Which documents mention Acme Corp?"*
- *"Find invoices with a confidence score below 0.7"*
- *"List all unique authors in the corpus"*
- *"Give me a summary of all HR policy documents"*

Claude will write the SQL, run it against your database, and present the
results — including the `file_path` so you can open the document directly.

---

## Updating the index

When you add new documents, just re-run the indexing script.
Already-indexed files are skipped automatically unless you pass `--reindex`.

```bash
python index_documents.py --folder /path/to/your/documents
```

---

## Schema

```
documents
├── id, file_path, file_name, file_ext, file_size_kb
├── doc_type    (contract | report | invoice | memo | ...)
├── title, summary
├── authors     (JSON array)
├── doc_date    (YYYY-MM-DD)
├── topics      (JSON array, up to 6)
├── entities    (JSON array — companies, people, places)
├── keywords    (JSON array, up to 10)
├── language    (ISO 639-1)
├── page_count  (PDF only)
├── confidence  (0.0–1.0)
├── indexed_at
└── raw_metadata (full JSON blob)

documents_fts   ← full-text search index (title, summary, authors,
                  topics, entities, keywords)
```

---

## Tips

**Customise the doc_type taxonomy** — edit `EXTRACTION_PROMPT` in
`index_documents.py` to match the document types in your organisation.

**Add domain-specific fields** — extend the JSON schema in the prompt and
add columns to the `SCHEMA` constant for things like project codes, contract
values, or department names.

**Combine with RAG** — use this index to narrow to 5–10 candidate files,
then pass those files to Claude for deep content questions.

**Low confidence scores** — documents with `confidence < 0.6` often had
poor text extraction (scanned PDFs, encrypted files). Consider flagging them
for manual review.
