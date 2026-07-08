---
name: document-template-upload
description: Uploads a document template (.docx, .pdf, .xlsx, .txt) to the local Next.js backend, registering its file name, title, and language in the PostgreSQL database.
---

# document-template-upload

This skill automates the upload of document templates to the local Next.js backend portal database and Vercel Blob store.

## How it Works
1. Reads the local file.
2. Calls the local Next.js upload API endpoint `POST http://localhost:3000/api/templates/upload`.
3. Registers the file in the PostgreSQL database registry and uploads it to the private Vercel Blob storage.

## Usage
Run the helper Python script directly:

### On WSL / Linux / macOS
```bash
python3 .agents/skills/document-template-upload/scripts/document_template_upload.py <file_path> <title> <language>
```

### On Windows
```powershell
python .agents/skills/document-template-upload/scripts/document_template_upload.py <file_path> <title> <language>
```

### Interactive Mode
If run without arguments, the script will guide you interactively:
```bash
python3 .agents/skills/document-template-upload/scripts/document_template_upload.py
```
