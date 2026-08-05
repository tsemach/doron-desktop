# ASC-91: Task Management System — Stacked PR Plan (revised)

## Context

Linear issue [ASC-91](https://linear.app/amicusx/issue/ASC-91/add-tasks-management-system) ("Add tasks management system") is too large for one PR. It bundles three UI surfaces plus their shared data model: **Task Template** management, task materialization during **new case creation**, a per-case **Tasks tab**, and a cross-case **Task Management** dashboard. Delivered as a `git stack` of small, independently-reviewable branches, in that feature order, so each branch rebases cleanly on its predecessor.

Revised per feedback on the first draft:
1. No 4-PR ceiling — split further into smaller, more reviewable chunks (backend/schema separated from frontend/UI wherever that's a clean seam).
2. **Every branch/PR stops for explicit approval before the next branch starts.** This is a hard process gate, not a suggestion.
3. **Merge direction is top-down**: once approved, the *last* branch merges into its parent, cascading down through every branch, with the *first* branch merging into `master` last. Implementation still proceeds bottom-up (each branch depends on code below it), but integration collapses from the tip of the stack down to master.
4. The Task UI is built as a **shared, reusable component set** (own branch), consumed identically by the case-tasks tab and the global dashboard — not duplicated per view.
5. Task-bearing components use `useReducer` (not scattered `useState`) and are performance-conscious: memoized rows, stable callbacks, memoized derived data — no unnecessary re-renders.
6. Every branch below gets a corresponding **Linear sub-issue under ASC-91**, created before implementation starts.

## Codebase conventions confirmed for this feature (via investigation, not assumption)

- **Reducer convention**: `apps/desktop/src/reducers/case-create.reducer.ts` is the only existing `useReducer` in the app — `enum <X>ActionType`, discriminated-union `type <X>Action`, `<X>State` interface, `createInitial<X>State()`, switch-based `function <x>Reducer(state, action)`. New task reducers follow this exactly.
- **Status badge convention**: `apps/desktop/src/components/ui/CaseStatusBadge.tsx` — `Record<Status, string>` Tailwind class map + `useLanguage()` for labels, renders a `<span>` pill. `TaskStatusBadge.tsx` mirrors this file structurally.
- **Shared cross-feature component location**: `apps/desktop/src/components/ui/` is *not* shadcn-only — it's already the de facto home for reusable business components used across unrelated features (`KebabMenu.tsx` used by both `App/AppHome.tsx` and `CaseManagement/*`; `ErrorAlert.tsx` used by both `CaseManagement` and `DocsManagement`). New `Task*` components go here, not in a new folder.
- **`packages/ui` (`@workspace/ui`) is not used by the desktop app at all** (only `apps/backend`/`apps/office` consume it) — confirmed via package.json/import search. Do not put task components there.
- **No existing memoization pattern to follow** — the codebase currently has almost no `React.memo`/`useCallback`/`useMemo` in list rendering (`OpenCasesDocumentsPanel*` maps over full arrays with no memoization). Since render-performance discipline was explicitly requested for this feature, the task components introduce `React.memo`/`useMemo`/`useCallback` as new-but-locally-scoped practice — it doesn't fight any existing convention, it just doesn't have a prior example to copy.

## Cross-cutting design decisions (carried over from prior round, still valid)

- **`status`**: `CHECK (status IN ('Waiting','In progress','Cancel','Done'))`, following the `tags` table precedent (`store/mod.rs:200,204`).
- **Estimate time**: structured `estimate_value REAL NOT NULL` + `estimate_unit TEXT NOT NULL CHECK (estimate_unit IN ('day','hour'))`, not a plain integer day-count. Supports fractional values (`0.5` day) and both granularities — `3d`, `0.5d`, `4h`, `10h` is a UI input/display format only, parsed into `(value, unit)` on save; the DB never stores the raw string. Applies to both `task_template_items` (PR-1) and `tasks` (PR-3).
- **`due_date` is a full ISO8601 timestamp**, not a date-only field, so hour-granularity estimates (`4h`) produce a precise due time instead of rounding to a day. Computed as `case_created_at + Duration::minutes(round(value_in_hours * 60))`, where `value_in_hours = estimate_value * 24` for `unit = 'day'` or `estimate_value` unchanged for `unit = 'hour'` — via `chrono::Duration` (already used in `email/emails_ingestion.rs:314`).
- **"Urgent" (dashboard)**: overdue/due-today (date-based) and `In progress` (status-based) are separate highlighted buckets, mirroring `lib/followupStatus.ts`'s shape; terminal statuses (`Cancel`, `Done`) excluded.
- **Ad-hoc task creation** (not from a template) lives in the case-tasks-tab branch, not the dashboard branch — the dashboard reuses the same mutation commands, it doesn't add new ones.
- **No migration framework** — new tables follow the existing `const ..._SCHEMA` + `execute_batch` pattern in `store/mod.rs::open_db_by_path`.

## Reusable Task component & state architecture (addresses feedback #3 and #4)

Built once, in its own branch (B6 below), consumed by both the case-tasks tab and the dashboard:

- **`components/ui/TaskStatusBadge.tsx`** — mirrors `CaseStatusBadge.tsx` exactly.
- **`components/ui/TaskRow.tsx`** — single task row, wrapped in `React.memo`. Props are primitives + stable callback references only (`{ task: Task; caseLabel?: string; onStatusChange: (id, status) => void; onEdit: (task) => void; onDelete: (id) => void }`) — `caseLabel` is optional so the *same* component serves the case-scoped view (no case column, per the issue's "some fields may not be present depending on where the task view is displayed") and the dashboard (case column shown).
- **`components/ui/TaskList.tsx`** — pure presentational container: maps an already-sorted/filtered `tasks` array to memoized `TaskRow`s. Sorting/filtering happens in the caller via `useMemo`, keeping `TaskList` itself dumb and reusable.
- **`components/ui/TaskForm.tsx`** — create/edit modal (title, description, status, estimate as a `1d`/`0.5d`/`4h` shorthand input parsed to `(estimate_value, estimate_unit)`, due_date).
- **`reducers/task-list.reducer.ts`** + a `useTaskList(fetchArgs)` hook — shared `useReducer`-based state (`{ tasks, loading, error, editingTask, taskPendingDelete }`) and mutation handlers (wrapped in `useCallback`, defined once per container instance so `TaskRow`'s memoization isn't broken by re-created closures per row), used identically by `CaseTasksPanel` (case-scoped: `list_tasks_for_case`) and `TaskManagementDashboard` (global: `list_all_tasks`) — they differ only in which Tauri command they call to populate `tasks`.

---

## Branch stack (9 branches, each its own PR, each gated on approval)

Root/base branch (PR-0, stacked directly on `master`, matching ASC-91's own `gitBranchName`): `tsemachmizrachi/asc-91-add-tasks-management-system`.

Each PR below has a corresponding Linear sub-issue under ASC-91; the branch name is that sub-issue's Linear-generated `gitBranchName` (not a hand-picked name), and each branch stacks on the previous one (PR-1 stacks on PR-0, PR-2 on PR-1, etc.):

| # | Sub-issue | Branch | Scope | Depends on |
|---|---|---|---|---|
| 1 | [ASC-127](https://linear.app/amicusx/issue/ASC-127) | `tsemachmizrachi/asc-127-task-templates-backend-schema-crud` | `task_templates`/`task_template_items` schema + `task_template/mod.rs` CRUD commands | PR-0 |
| 2 | [ASC-128](https://linear.app/amicusx/issue/ASC-128) | `tsemachmizrachi/asc-128-task-templates-management-ui` | Task Template management page (mirrors `CasesManagementTemplate/`) + sidebar nav/route | PR-1 |
| 3 | [ASC-129](https://linear.app/amicusx/issue/ASC-129) | `tsemachmizrachi/asc-129-case-creation-tasks-backend-schema-materialize` | `tasks` table schema, `create_new_case` gains `task_template_id`, `materialize_tasks_from_template` | PR-2 |
| 4 | [ASC-130](https://linear.app/amicusx/issue/ASC-130) | `tsemachmizrachi/asc-130-case-creation-tasks-ui-template-selector` | Case-creation form/reducer: "Task Template" selector wired to `create_new_case` | PR-3 |
| 5 | [ASC-131](https://linear.app/amicusx/issue/ASC-131) | `tsemachmizrachi/asc-131-task-crud-backend-commands` | `task/mod.rs`: `list_tasks_for_case`, `create_task`, `update_task`, `update_task_status`, `delete_task` | PR-4 |
| 6 | [ASC-132](https://linear.app/amicusx/issue/ASC-132) | `tsemachmizrachi/asc-132-shared-reusable-task-ui-components-state` | Reusable `TaskStatusBadge`/`TaskRow`/`TaskList`/`TaskForm` + `task-list.reducer.ts`/`useTaskList` (described above); **not wired into any screen yet** — reviewable/testable in isolation | PR-5 |
| 7 | [ASC-133](https://linear.app/amicusx/issue/ASC-133) | `tsemachmizrachi/asc-133-case-details-tasks-tab` | Case details view: new `"tasks"` tab (widens `activeRightTab`), `CaseTasksPanel` wiring `useTaskList` + `TaskList`/`TaskForm` from PR-6, ad-hoc create | PR-6 |
| 8 | [ASC-134](https://linear.app/amicusx/issue/ASC-134) | `tsemachmizrachi/asc-134-task-dashboard-backend-aggregation` | `task/mod.rs::list_all_tasks` (joins `tasks`+`cases`, mirrors `list_cases`'s join style) | PR-7 |
| 9 | [ASC-135](https://linear.app/amicusx/issue/ASC-135) | `tsemachmizrachi/asc-135-task-dashboard-ui` | New top-level `TaskManagement/` section (mirrors `DocsManagement.tsx`), urgency bucketing (`lib/task/taskUrgency.ts`), dashboard reusing PR-6's components, route in `AppMain.tsx` + tile in `AppHome.tsx` | PR-8 |

### Branch details

**B1 — task-template-backend.** Schema (`store/mod.rs`, new `TASK_TEMPLATES_SCHEMA` const batched alongside `CASE_TEMPLATES_SCHEMA` at ~line 139):
```sql
CREATE TABLE IF NOT EXISTS task_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_template_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    estimate_value REAL NOT NULL,
    estimate_unit  TEXT NOT NULL CHECK (estimate_unit IN ('day','hour')),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (task_template_id) REFERENCES task_templates(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_template_items_template ON task_template_items(task_template_id);
```
Owned child table (not a join table like `case_template_docs` — items aren't independently reusable). New `apps/desktop/src-tauri/src/task_template/mod.rs` mirrors `case_template/mod.rs`: `list/create/update/delete_task_template`. `store/mod.rs` gains `TaskTemplateRow`/`TaskTemplateItemRow`/`TaskTemplateItemInput` (`estimate_value: f64, estimate_unit: String`) + matching query fns. `lib.rs`: `pub mod task_template;` + register under `// task_template`. Frontend (PR-2) parses/formats the `1d`/`0.5d`/`4h` shorthand at the form boundary only — `estimate_value`/`estimate_unit` cross the Tauri IPC boundary as separate fields, never as a combined string.

**B2 — task-template-ui.** New `lib/task/types.ts` (`TaskStatus`, `TaskTemplateItem`, `TaskTemplate`). New `CaseManagement/CasesManagementTaskTemplate/` — 1:1 structural mirror of `CasesManagementTemplate/CasesManagementTemplate.tsx`: orchestrator + `TaskTemplateList`/`TaskTemplateCreateForm`/`TaskTemplateDetailsView`/`TaskTemplateEmptyState`/`TaskTemplateDeleteWarningModal`. Route in `CaseManagement.tsx`, nav button in `CasesManagementSidebar.tsx`.

**B3 — case-create-tasks-backend.** New `tasks` table (full column set + indexes up front, so no later branch needs another schema pass):
```sql
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER NOT NULL, title TEXT NOT NULL,
    description TEXT, status TEXT NOT NULL DEFAULT 'Waiting'
        CHECK (status IN ('Waiting','In progress','Cancel','Done')),
    estimate_value REAL, estimate_unit TEXT CHECK (estimate_unit IN ('day','hour')),
    due_date TEXT, task_template_item_id INTEGER,
    created_at TEXT NOT NULL, updated_at TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
    FOREIGN KEY (task_template_item_id) REFERENCES task_template_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_case_id ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
```
`estimate_value`/`estimate_unit` are nullable together (both-or-neither at the app layer) since ad-hoc tasks (PR-7) may have no estimate at all; `due_date` is a full ISO8601 timestamp per the cross-cutting decision above, not a date. `case/mod.rs::create_new_case` (currently `case/mod.rs:112-120`) gains `task_template_id: Option<i64>`; new `store::materialize_tasks_from_template(conn, case_id, task_template_id, case_created_at)` inserts concrete rows with `due_date` computed from the item's `(estimate_value, estimate_unit)`. Verified via DB inspection — no UI yet.

**B4 — case-create-tasks-ui.** `reducers/case-create.reducer.ts` gains `selectedTaskTemplateId`/`taskTemplates` state; `CaseManagementCaseCreate.tsx` parallel-loads `list_task_templates` and passes `taskTemplateId` to `create_new_case`; `CaseManagementCaseCreateForm.tsx` gets a second "Task Template" `<select>` beside the existing Case Template one (~lines 109-135).

**B5 — task-crud-backend.** New `apps/desktop/src-tauri/src/task/mod.rs`: `list_tasks_for_case`, `create_task`, `update_task`, `update_task_status` (mirrors `case::update_case_status`), `delete_task`. `store/mod.rs`: `TaskRow` + query fns. `lib.rs`: `pub mod task;` + register under `// task`.

**B6 — task-shared-components.** As described in the architecture section above. `lib/task/types.ts` gains the `Task` interface. This branch has no consumer screen yet — reviewable purely as a component/reducer diff (props, memoization, reducer actions).

**B7 — case-tasks-view.** `CaseManagementOpenCasesDetails.tsx`: widen `activeRightTab` (line 39) from `"preview" | "emails"` to `"preview" | "emails" | "tasks"`; header switch (~509) and content switch (~583-624) render `CaseTasksPanel`. `OpenCasesDocumentsPanel.tsx`/`OpenCasesDocumentsPanelTopMenu.tsx`: widen the same prop type, add a "Tasks" kebab-menu entry (mirrors the existing "emails" entry, ~184-206). New `CaseTasksPanel.tsx` composes `useTaskList` + `TaskList` + `TaskForm` from B6, adds the ad-hoc "+ Add Task" flow.

**B8 — task-dashboard-backend.** `task/mod.rs::list_all_tasks()`; `store/mod.rs::TaskWithCaseRow` (`#[serde(flatten)] task: TaskRow` + `case_subject`/`case_name`), joins `tasks t JOIN cases c ON t.case_id = c.id WHERE c.deleted = 0 OR c.deleted IS NULL ORDER BY t.due_date ASC` (mirrors `list_cases`'s join style, store/mod.rs:51-54).

**B9 — task-dashboard-ui.** `lib/task/types.ts` gains `TaskWithCase`. New `lib/task/taskUrgency.ts` (client-side bucketing, mirrors `followupStatus.ts`). New `components/TaskManagement/` (`TaskManagement.tsx` mirrors `DocsManagement.tsx`'s top-level structure, `TaskManagementHeader.tsx` mirrors `DocsManagementHeader.tsx`, `TaskManagementDashboard.tsx` uses `useTaskList`/`TaskList`/`TaskForm` from B6 with `caseLabel` populated). Route in `AppMain.tsx`, third launcher tile in `AppHome.tsx` (note: current 2-tile `flex-row justify-center gap-8` layout needs a small adjustment for a 3rd tile).

---

## Process rules

1. **Approval gate**: after each branch's implementation is complete and pushed as a PR, stop and wait for explicit approval before starting the next branch. No chaining ahead.
2. **Merge order (top-down)**: once approved end-to-end, integration proceeds from the tip of the stack downward — B9 merges into B8, B8 into B7, ..., B2 into B1, and finally B1 merges into `master`. Each PR's GitHub base is its stack predecessor (B2's base = B1, etc.), so this is a straightforward sequential merge in reverse branch order, not a special git operation.
3. **Linear sub-issues**: before implementation starts, create 9 sub-issues under ASC-91 (`parentId` = ASC-91's id), one per branch above, titled to match the branch scope (e.g. "Task templates: backend schema + CRUD", "Task templates: management UI", ...). This happens as the first step after this plan is approved, via the Linear MCP tools, with each branch's PR description linked to its sub-issue.

## git-stack workflow

```bash
# PR-0: base branch, matches ASC-91's own gitBranchName
git checkout -b tsemachmizrachi/asc-91-add-tasks-management-system master

# PR-1, stacked on PR-0, branch name = ASC-127's gitBranchName
git checkout -b tsemachmizrachi/asc-127-task-templates-backend-schema-crud tsemachmizrachi/asc-91-add-tasks-management-system
# ... implement PR-1, commit, push, open PR (base=PR-0), STOP for approval ...

# PR-2, stacked on PR-1, branch name = ASC-128's gitBranchName
git checkout -b tsemachmizrachi/asc-128-task-templates-management-ui tsemachmizrachi/asc-127-task-templates-backend-schema-crud
# ... implement PR-2, commit, push, open PR (base=PR-1), STOP for approval ...
# ... repeat through PR-9 (ASC-135), always branching from the previous branch ...
```
- `git stack` — show the stack / verify order.
- `git stack next -b` / `git stack previous -b` — navigate branch tips.
- `git stack amend -a` / `reword` — fix an earlier branch; descendants auto-rebase.
- `git stack sync` — rebase the whole stack onto `master` if it moves during development.
- `git stack run -- <cmd>` — verify every commit in the stack builds (`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`, `npx tsc --noEmit` in `apps/desktop/`).
- `git stack --push` — only after confirmation, per branch.

## Verification (per branch)

- Rust: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`; add tests under `apps/desktop/src-tauri/tests/` for non-trivial logic (B3's `materialize_tasks_from_template` is the prime candidate).
- Frontend: `npx tsc --noEmit` in `apps/desktop/`.
- Manual, via the `run`/`debug` skill, scoped to what that branch actually changed (e.g. B6 has no screen to click through — verify via a throwaway render or defer full manual verification to B7/B9 which consume it).
- For B6/B7/B9 specifically: confirm `TaskRow` doesn't re-render on unrelated state changes (React DevTools profiler or a quick console-log-in-render check) and that filtered/sorted lists aren't recomputed every render.

### Critical files
- `apps/desktop/src-tauri/src/store/mod.rs`
- `apps/desktop/src-tauri/src/case/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/components/CaseManagement/CasesManagementTemplate/CasesManagementTemplate.tsx`
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx`
- `apps/desktop/src/reducers/case-create.reducer.ts`
- `apps/desktop/src/components/ui/CaseStatusBadge.tsx` (pattern for `TaskStatusBadge.tsx`)
