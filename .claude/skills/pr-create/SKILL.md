---
name: pr-create
description: Automatically stages, commits, pushes, and creates a Pull Request on GitHub from the current branch using the `gh` command-line tool, formatting the title with the `[CR-XXXX]` prefix if found.
---

# pr-create

This skill automates the creation of a GitHub Pull Request from the current branch.

## How it Works
1. Resolves the current Git branch name.
2. If the branch starts with the pattern `cr-xxxx` or `CR-xxxx` (e.g. `cr-1234-fix-ui`), it formats the PR title as `[CR-XXXX] Human Readable Title` (e.g. `[CR-1234] Fix ui`).
3. If there are uncommitted changes, it stages all files, commits them with the PR title, and pushes the branch to GitHub.
4. Reads the `.github/pull_request_template.md` template, populates it with the correct ticket ID, and creates the PR using the `gh` CLI command.

## Usage
Run the helper Python script directly:

### On WSL / Linux / macOS
```bash
python3 .agents/skills/pr-create/scripts/pr_create.py
```

### On Windows
```powershell
python .agents/skills/pr-create/scripts/pr_create.py
```
