---
name: issue
description: Given a Linear issue ID, fetches it via the Linear MCP server, researches the codebase to understand exactly what's needed, then presents an implementation plan (emphasizing code reuse and separation of concerns) for approval before writing any code.
---

# issue

This skill turns a Linear issue ID into a reviewed implementation plan. It does **not** write code — it stops after presenting the plan and waits for explicit approval. Use `/pr-create` (commit/push/PR) and the branch-per-issue convention already established in this repo as the follow-up once a plan is approved.

## Usage

```
/issue AMI-23
```

If no issue ID is given, ask the user for one before doing anything else. Accept whatever identifier format Linear uses in this workspace (e.g. `AMI-23`); don't guess or invent one.

## Workflow

### 1. Fetch the issue
Call `mcp__linear-server__get_issue` with `id` set to the given identifier and `includeRelations: true` (surfaces blocking/related/duplicate issues, which often matter for scoping). If the tool isn't loaded yet, use ToolSearch first (`select:mcp__linear-server__get_issue`).

If the ID doesn't resolve, don't guess a different one — use `mcp__linear-server__list_issues` with a `query` search against the title text the user gave you, confirm the match with the user, then proceed.

### 2. Understand what's actually being asked
Read the issue title, description, and any numbered/bulleted requirements literally — resist the urge to paraphrase into something broader or narrower than what's written. If the description references UI elements, screenshots, or terms specific to this codebase (e.g. "Kaba menu", "case card", a component name), treat those as pointers to go find, not to reinterpret.

### 3. Research the codebase
Before proposing anything, actually go look:
- Find the components/files the issue is about. Use Explore (or direct `grep`/`find` for a quick, targeted lookup) rather than assuming file locations from memory.
- Read enough of each relevant file to know its current props, state, and behavior — not just enough to guess.
- Check for **existing** mechanisms that already do something close to what's needed: a shared UI primitive, a generic Tauri command, an existing translation key, a modal/state pattern already wired up elsewhere. This step is what makes step 4 actually reuse things instead of just claiming to.
- If the issue implies backend/persistence work, check whether a command already exists (`grep` for `#[tauri::command]` in the relevant Rust module) before assuming one needs to be added.

### 4. Write the plan
Present findings and the plan directly in the chat response (not a file, not a TaskCreate/plan-mode call) using two sections:

**What's there today** — a short, concrete summary of the current implementation: which files own which behavior, and specifically which existing pieces (components, commands, hooks, translation keys, modals) can be reused as-is versus what's genuinely missing.

**Proposed plan** — a numbered list of concrete changes, one item per file or logical unit, stating exactly what changes and why. For each new abstraction you're about to introduce, justify it by the number of real call sites it will have — one call site is not a reason for a new component/function. Prefer extending or reusing an existing piece over adding a new one when the existing piece already covers the shape of the problem.

Close by asking whether to proceed. Do not start editing files, creating branches, or running verification until the user confirms.

## Constraints

- No code changes, branch creation, or commits during this skill — it produces a plan only.
- Don't fetch or reference other issues beyond what's needed to scope this one (relations from step 1 are enough; don't go browsing the whole backlog).
- If the issue is ambiguous enough that two materially different plans are both reasonable, ask a clarifying question (or use AskUserQuestion) instead of picking one silently.
- Keep the plan concrete and file-specific — "refactor the component" is not a plan; "extract X into `Y.tsx`, threading `Z` down as a prop" is.
