# Case Matcher — Implementation Plan

Phased build plan for [`case_matcher_design.md`](./case_matcher_design.md).

Ordering principle: **every phase ends with a command you can run and a number you can read.**
Where a phase cannot be meaningfully tested on its own, it is merged into the next one rather than
left dangling. Each phase leaves the tree compiling, `cargo test` green, and the app shippable.

---

## Linear issues, branches, and PR chain

Parent issue: **[AMI-7](https://linear.app/amicusx/issue/AMI-7/redesign-and-implement-new-email-classifier)** — redesign and implement new email classifier.

Each phase is a sub-issue with its own branch and PR. **Every phase branches from the phase before
it**, so the PRs form a stack that unwinds into `master`:

```
PR-6 → PR-5 → PR-4 → PR-3 → PR-2 → PR-1 → PR-0 → master
```

| PR | Phase | Issue | Branch | Branches from |
|---|---|---|---|---|
| **PR-0** | design + plan (P0 findings) | [AMI-7](https://linear.app/amicusx/issue/AMI-7) | `tsemachmizrachi/ami-7-redesign-and-implement-new-email-classifier` | `master` |
| — | P0 reality check ✅ done | [AMI-110](https://linear.app/amicusx/issue/AMI-110) | *(no code — delivered in PR-0)* | — |
| **PR-1** | P1 eval corpus generator | [AMI-111](https://linear.app/amicusx/issue/AMI-111) | `tsemachmizrachi/ami-111-p1-case-matcher-eval-corpus-generator` | PR-0 |
| **PR-2** | P2 schema + index builders | [AMI-112](https://linear.app/amicusx/issue/AMI-112) | `tsemachmizrachi/ami-112-p2-case-matcher-schema-and-index-builders` | PR-1 |
| **PR-3** | P3 attachments + signals | [AMI-113](https://linear.app/amicusx/issue/AMI-113) | `tsemachmizrachi/ami-113-p3-case-matcher-attachments-and-signal-widening` | PR-2 |
| **PR-4** | P4 matcher core + Tier A | [AMI-114](https://linear.app/amicusx/issue/AMI-114) | `tsemachmizrachi/ami-114-p4-case-matcher-core-tier-a-and-run-harness` | PR-3 |
| **PR-5** | P5 Tier B + Tier C | [AMI-115](https://linear.app/amicusx/issue/AMI-115) | `tsemachmizrachi/ami-115-p5-case-matcher-tier-b-content-similarity-and-tier-c-fuzzy` | PR-4 |
| **PR-6** | P6 tuning + feedback | [AMI-116](https://linear.app/amicusx/issue/AMI-116) | `tsemachmizrachi/ami-116-p6-case-matcher-tuning-ablation-feedback-learning` | PR-5 |

**PR-0** carries the design and plan documents (including the P0 findings) and no code. It is the
integration branch for the whole feature — nothing merges to `master` until the stack is ready.

**Creating a phase branch** (do this when the phase starts, not up front — each must branch from the
*current* state of its parent):

```bash
git checkout tsemachmizrachi/ami-111-p1-case-matcher-eval-corpus-generator   # parent phase branch
git pull                                                                     # take parent's latest
git checkout -b tsemachmizrachi/ami-112-p2-case-matcher-schema-and-index-builders
```

Open each PR with its **parent phase branch as the base**, not `master` — GitHub then shows only
that phase's diff. When a parent PR merges, GitHub retargets its children automatically.

**Rebasing.** If a parent phase changes after a child branched (review feedback on PR-2 while PR-3
is open), rebase the child onto the updated parent rather than merging — the stack stays linear and
each PR keeps showing only its own work:

```bash
git checkout <child-branch> && git rebase <parent-branch> && git push --force-with-lease
```

---

## Phase overview

| Phase | Issue / PR | Goal | Size | Testable by | Gate |
|---|---|---|---|---|---|
| **P0** | AMI-110 / — | Reality check on real data | XS | SQL against a real profile | ✅ **DONE** — findings below |
| **P1** | AMI-111 / PR-1 | Eval corpus generator | M | `eval email generate` + `corpus-stats` | Corpus has the right difficulty spread |
| **P2** | AMI-112 / PR-2 | Schema + index builders | L | `eval email index` | Identifier mining finds the identifiers cases actually carry |
| **P3** | AMI-113 / PR-3 | Attachments + signal widening | M | `eval email signals` | Signal recall ≥ target, attachments extracted |
| **P4** | AMI-114 / PR-4 | Matcher core + Tier A + run harness | L | `eval email run --mode matcher` | `easy`+`thread` pass, **0 mislinks** |
| **P5** | AMI-115 / PR-5 | Tier B + Tier C | L | same run + `eval email compare` | `medium` passes, `hard` beats P4 baseline |
| **P6** | AMI-116 / PR-6 | Tuning, ablation, feedback learning | M | `eval email run --sweep` | Shipped thresholds derived from data |

Dependency chain is linear (P0→P6) with one exception: **P1 has no dependency on app code** and can
be built in parallel with P2 if two people are working.

The first end-to-end match measurement is **P4**. P0–P3 are the data and evidence the matcher needs
to exist at all; each still produces its own observable output so a regression is caught where it
happens rather than three phases later.

---

## P0 — Reality check ✅ DONE

> **AMI-110** · no PR — findings delivered in PR-0

**Goal:** answer two questions that change the design before any code is written. No code produced;
~20 minutes of SQL against a real profile (`documents.db`, 9 cases / 222 documents).

### Q1 — Do documents actually live under case folders?

```sql
SELECT COUNT(DISTINCT d.id) FROM documents d
JOIN cases c ON c.deleted=0 AND c.folder<>'' AND d.file_path LIKE c.folder||'/%';

SELECT c.id, c.name, COUNT(d.id) AS docs
FROM cases c LEFT JOIN documents d
  ON c.folder<>'' AND d.file_path LIKE c.folder||'/%'
WHERE c.deleted=0 GROUP BY c.id ORDER BY docs DESC;
```

**Result: yes.** All 9 cases have documents under their folder (5–21 each), 82 of 222 documents
total. Tier B's document half is viable → **keep the 0.6 case-text / 0.4 document blend.**

**Bug found.** The prefix must include a trailing separator. With `folder || '%'`, case
`…/remove-me` absorbed all 9 documents of `…/remove-me2` — 17 counted where 8 are real. Design §4.2
now specifies `folder || '/%'` with separator normalization, and NULL on ambiguity.

### Q2 — Do cases carry parseable identifiers?

```sql
SELECT COUNT(*) FROM cases WHERE deleted=0
  AND (subject GLOB '*[0-9]/[0-9]*' OR name GLOB '*[0-9]/[0-9]*');
SELECT field_name, COUNT(*) FROM case_fields GROUP BY field_name ORDER BY 2 DESC;
```

**Result: no court case numbers at all.** 0 cases have `\d+/\d+` in subject or name; 3 field
values match and look like dates. What cases *do* carry:

| Identifier | Evidence |
|---|---|
| National IDs (`ת.ז`) | 30 populated values, as `מאת:ת.ז:1..4` / `מקבל:ת.ז:1..4` |
| Land registry | `גוש ספר`, `חלקה דף`, `תת חלקה` — the de-facto matter key in conveyancing |
| Deed number | `שטר` |
| Party names | `שם מלא`, `שם פרטי`, `שם משפחה` |

Field names are **compound** — `role:field:index` (`מאת:ת.ז:2`). And
`emails_classify_deterministic.rs` has **zero** regex coverage for `גוש`/`חלקה`/`שטר`.

### Decisions taken

| Finding | Consequence |
|---|---|
| Documents are under case folders | Tier B blend stays 0.6 / 0.4 |
| Prefix join leaks across sibling folders | `folder || '/%'` + ambiguity → NULL (design §4.2) |
| No court case numbers; land registry + `ת.ז` instead | Tier A reorganized by *identifier precision*, carrying both litigation and conveyancing families (design §5.5) |
| No regex for land registry | New pattern family in design §5.2; `EmailExtractedSignals` gains `land_registry`, `deeds` |
| Compound field names | Miner parses `role:field:index` rather than scanning values (design §5.3) |

**Caveat.** Developer profile, 9 cases, visible test data (`sss`, `aaa`, `fffffffff`). Trustworthy:
which field types the templates define, the absence of a case-number field, the naming convention,
and the join bug — these reflect design, not data entropy. Not trustworthy: counts, distributions,
per-case averages. **Re-run Q1/Q2 against a customer profile before P5 finalizes weights.**

Ascurix targets **both litigation and conveyancing**, so Tier A must carry both identifier families
and work for cases that have only one.

---

## P1 — Eval corpus generator

> **AMI-111** · PR-1 · branch `tsemachmizrachi/ami-111-…`

**Goal:** a labeled, reproducible corpus. Built first because every later phase is measured against
it, and because it touches no app code (zero regression risk).

### Scope

| File | Change |
|---|---|
| `bin/eval/email/generate.rs` | rewrite — real generator, not a fixture copy |
| `bin/eval/email/corpus.rs` | **new** — case/document/email synthesis |
| `bin/eval/email/corpus_stats.rs` | **new** — `corpus-stats` subcommand |
| `bin/eval/email/mod.rs` | register `CorpusStats` subcommand |
| `bin/eval/main.rs` | dispatch |

Generates the layout in design §7.1: `cases/case_NNN/` folders with `.docx`/`.txt`/`.pdf`
documents, `attachments/`, `cases.json`, `email_matching_dataset.json`.

**Both practice areas must be generated** (P0: Ascurix serves litigation *and* conveyancing, and
they identify a matter completely differently). A `--practice-mix` flag controls the split, default
50/50:

- *litigation* cases carry a court case number, party pair (`X נ' Y`), court/gov senders
- *conveyancing* cases carry `גוש/חלקה/תת חלקה`, `שטר`, `מאת`/`מקבל` parties with `ת.ז`, and
  **no case number at all** — these are the cases that would silently score 0 under the original
  design

Case fields must be emitted with the real compound naming (`מאת:ת.ז:2`, `גוש ספר:1`), otherwise P2's
field-name mining is tested against a format that does not occur in production.

The fixture format carries **expected signals** as well as the expected case, so P3 can be scored
before the matcher exists:

```json
{
  "id": "em_014",
  "sender": "adv.cohen@lawfirm.co.il",
  "subject": "עדכון בתיק 12345/23 — דיון בתאריך 12/03",
  "body_text": "...",
  "in_reply_to": "<prev@example.com>",
  "attachments": [{ "name": "כתב_תביעה.docx", "path": "attachments/em_014_1.docx" }],
  "expected": {
    "case_id": 12,
    "difficulty": "easy",
    "signal": "case_number",
    "band": "AutoLink",
    "signals": {
      "case_numbers": ["12345/23"],
      "party_names": [],
      "emails": ["adv.cohen@lawfirm.co.il"],
      "dates": ["12/03"]
    }
  }
}
```

and the conveyancing counterpart, which carries no case number:

```json
{
  "id": "em_087",
  "sender": "moshe@realestate.co.il",
  "subject": "העברת זכויות — גוש 972 חלקה 11 תת חלקה 33",
  "body_text": "...מצורף שטר 4471 בעניין הנכס...",
  "expected": {
    "case_id": 24,
    "practice": "conveyancing",
    "difficulty": "easy",
    "signal": "land_registry",
    "band": "AutoLink",
    "signals": {
      "land_registry": ["972/11/33"],
      "deeds": ["4471"],
      "national_ids": [],
      "party_names": []
    }
  }
}
```

Determinism via `--seed` is required — an eval you cannot reproduce cannot be compared across runs.

### Eval commands

```bash
cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml -- \
  email generate --corpus-dir ./email_eval_corpus \
  --cases 30 --emails 200 --with-attachments --lang mixed --practice-mix 50/50 --seed 42

cargo run --bin eval --manifest-path apps/desktop/src-tauri/Cargo.toml -- \
  email corpus-stats --corpus-dir ./email_eval_corpus
```

`corpus-stats` prints composition — difficulty spread, practice-area split, language mix,
attachment count, emails per case, how many cases have zero emails, adversarial pair count.

### Exit criteria

- Same `--seed` produces byte-identical output twice.
- Difficulty spread within ±3% of design §7.1 targets; practice-area split within ±3% of
  `--practice-mix`.
- Every conveyancing case has `גוש/חלקה` fields and **no** case number; every litigation case has a
  case number. A generator that leaks case numbers into conveyancing cases would mask exactly the
  failure P0 found.
- Every `expected.case_id` refers to a case in `cases.json`; every attachment path exists.
- Generated `.docx` round-trips through `crate::extractor::extract` (assert in a unit test — a
  corpus of unparseable documents would silently zero out Tier B later).

### Notes

Hebrew and English content both generated (`--lang mixed`). The `hard` slice must introduce genuine
vocabulary drift between an email and its case's documents, otherwise P5 will look better than it
is.

---

## P2 — Schema and index builders

> **AMI-112** · PR-2 · branch `tsemachmizrachi/ami-112-…`

**Goal:** the three derived indexes exist and are populated, and you can see what they contain.

### Scope

| File | Change |
|---|---|
| `store/mod.rs` | add `case_identifiers`, `case_text_fts`, `case_matcher_settings`; `documents.case_id` column + index; thread-ref columns on `case_emails` / `pending_email_alerts`; guarded backfill |
| `case/identifiers.rs` | **new** — `rebuild_case_identifiers`, `rebuild_all_case_identifiers`, `learn_from_confirmed_email` |
| `case/documents_link.rs` | **new** — `assign_document_case`, `reassign_documents_for_case`, `backfill_document_case_ids` |
| `case/case_text_index.rs` | **new** — `rebuild_case_text_fts`, `rebuild_all_case_text_fts` |
| `case/mod.rs` | hook rebuilds into `create_new_case`, `save_case_fields`, annotation writes; set `case_id` explicitly in `add_file_to_case` |
| `indexer/mod.rs` | hook `assign_document_case` after `store::insert_document` |
| `email/case_matcher/config.rs` | **new** — `MatcherConfig` + `load`/`save`/defaults |

Identifier mining is driven primarily by **field names** (`role:field:index`, design §5.3), with
the regex set in `emails_classify_deterministic.rs::patterns()` as the value-scanning backstop.
Per P0, the land-registry and deed patterns do not exist yet — they are added in P3, so P2's mining
of `גוש`/`חלקה`/`שטר` comes from field names only, and P3 extends it to free text.

### Eval changes

New `eval email index` — builds a scratch DB from a corpus and reports index health:

| File | Change |
|---|---|
| `bin/eval/email/index_cmd.rs` | **new** |
| `bin/eval/email/harness.rs` | **new** — shared corpus→DB builder, reused by P4/P5 |

```bash
cargo run --bin eval ... -- email index --corpus-dir ./email_eval_corpus
```

Uses `store::open_db_by_path` (schema created inline) then
`indexer::index_file_core(db_path, &LlmProvider::Mock, ...)` per corpus document — the real
indexer, not a reimplementation.

Output:

```
Cases:              30
Documents indexed:  247   (docs FTS rows: 247)
documents.case_id:  241   (97.6% of corpus documents assigned)
case_text_fts:      30
case_identifiers:   412
  national_id    84  (87% of cases have ≥1)
  land_registry  46  (73% of cases have ≥1)
  case_number    22  (litigation cases only)
  party_name     71
  email          96
  deed            9
  phone          44
  folder_token  147
Cases with NO decisive identifier: 2   ← Tier A can never match these
```

That last line is the one to watch: a case carrying no decisive identifier (case number, land
registry, deed, or ID) can never be matched by Tier A and depends entirely on Tier B.

### Exit criteria

- ≥90% of generated cases have ≥1 **decisive** identifier (case number *or* land registry *or*
  deed *or* national ID). The generator plants them, so a lower number means field-name mining is
  failing — fix before P4. Report the breakdown per practice area: litigation cases should yield
  case numbers, conveyancing cases land-registry keys.
- ≥95% of corpus documents have `case_id` set; no document assigned to the wrong case.
- Backfill marker prevents a second run from re-doing the work; deleting the marker re-runs it.
- Unit tests: normalizer (Hebrew finals, geresh, clitic prefixes, ID canonicalization), identifier
  mining from each source, compound field-name parsing, `assign_document_case` ambiguity → NULL,
  sibling-folder leak (`remove-me` vs `remove-me2`) does not cross-assign.
- `cargo test` green; app still launches and existing email flow is unaffected (matcher not yet
  wired — `resolve_case_api` still returns the stub).

### Risks

Migration touches `store/mod.rs`'s shared schema batch. Verify an existing dev profile opens
cleanly and the backfill completes without blocking startup (design §6.2 requires it off the open
path, marker set only on success).

---

## P3 — Attachments and signal widening

> **AMI-113** · PR-3 · branch `tsemachmizrachi/ami-113-…`

**Goal:** the matcher's *input* is complete — full body text, attachment text, thread headers — and
measurably so.

### Scope

| File | Change |
|---|---|
| `email/emails_attachments.rs` | **new** — `extract_attachment_texts`, `AttachmentLimits` |
| `email/emails_ingestion.rs` | capture `In-Reply-To` / `References` in `extract_parts`; call attachment extraction after staging |
| `email/emails_orchestrate.rs` | `PreparedEmail` gains `attachment_text`, `in_reply_to`, `references`; signal extraction over subject + **full body** + attachment text |
| `email/emails_classify_deterministic.rs` | add `normalize_for_match`; **new land-registry + deed pattern family** (`גוש`/`חלקה`/`תת חלקה`/`שטר`) with composite assembly; `EmailExtractedSignals` gains `land_registry`, `deeds` |
| `email/emails_case_api.rs` | `CaseMatchRequest` gains the same fields |

Fixes the live defect noted in design §2: `extract_email_signals` currently receives only the
500-char snippet, so identifiers past that point are invisible.

Also closes the P0 gap: the extractor has no `גוש`/`חלקה`/`שטר` patterns today, so a conveyancing
email is currently invisible to the matcher no matter how well the rest works. Components may be
written apart, in either order, or comma-separated, so the extractor collects them within a bounded
window and assembles the canonical composite (`972/11/33`), emitting the partial when no sub-parcel
is present.

Attachment extraction is read-only over already-staged files — staging, import and display are
untouched.

### Eval changes

New `eval email signals` — scores signal extraction against `expected.signals`, no matcher needed:

| File | Change |
|---|---|
| `bin/eval/email/signals_cmd.rs` | **new** |

```bash
cargo run --bin eval ... -- email signals --corpus-dir ./email_eval_corpus
```

```
Signal extraction (200 emails)
  case_numbers   recall 98%  precision 96%   [litigation]
  land_registry  recall 94%  precision 97%   [conveyancing]
  deeds          recall 91%  precision 95%   [conveyancing]
  national_ids   recall 96%  precision 93%
  party_names    recall 71%  precision 82%
  emails         recall 99%  precision 99%
  phone_numbers  recall 88%  precision 91%
Attachments
  extracted      178/184 (96.7%)
  skipped        6  (unsupported: 4 png, 2 zip)
  chars total    1.2M   avg 6.7K
Body coverage
  signals found beyond snippet cutoff: 34 emails  ← would be missed pre-P3
```

That final line quantifies the snippet bug and is the clearest proof P3 did something.

### Exit criteria

- `case_numbers` recall ≥95% (litigation), `land_registry` recall ≥90% (conveyancing),
  `emails` recall ≥95% on the corpus.
- Composite assembly unit-tested: split/reordered/comma-separated גוש-חלקה-תת חלקה all normalize to
  the same key; גוש alone does **not** emit a composite.
- Attachment extraction success ≥95% for supported types; unsupported types recorded with a reason,
  never an error.
- Corrupt/oversize/zero-byte attachment does not fail the pipeline (unit tests).
- `cargo test` green; app behaviour unchanged (still stub-matching).

---

## P4 — Matcher core, Tier A, and the run harness

> **AMI-114** · PR-4 · branch `tsemachmizrachi/ami-114-…`

**Goal:** first end-to-end case matching. This is the phase where the feature starts working.

### Scope

| File | Change |
|---|---|
| `email/case_matcher/mod.rs` | **new** — `CaseMatcher`, `match_email_core` |
| `email/case_matcher/tier_a.rs` | **new** — A0 thread ref → A8 phone, both identifier families, composite land-registry longest-prefix lookup, conditional decisiveness |
| `email/case_matcher/scoring.rs` | **new** — weighted aggregation, bands, ambiguity guard |
| `email/case_matcher/explain.rs` | **new** — structured `reason` |
| `email/emails_case_api.rs` | `LocalCaseMatcherApi` replaces the stub in `resolve_case_api` |
| `email/emails_orchestrate.rs` | `EmailPipelineMode`; `PipelineStopStage` rename; LLM stage skipped in `Deterministic` |

Tiers B/C are not built yet — `match_email_core` calls Tier A, then a stubbed content score of 0.0.
The scoring/band/ambiguity machinery is fully implemented here so P5 only adds signal sources.

**Behaviour change:** the app starts creating real `pending_email_alerts` with a
`suggested_case_id`. Until now every email fell through to no-match and was purged. Ship with
`auto_link_enabled: false` so everything lands in the review lane — no automatic linking on the
first release of the matcher.

### Eval changes

| File | Change |
|---|---|
| `bin/eval/email/matcher_run.rs` | **new** — drives `match_email_core` per fixture |
| `bin/eval/email/matcher_metrics.rs` | **new** — metrics + report |
| `bin/eval/email/history.rs` | **new** — persist runs to `evaluation_history.db` |
| `bin/eval/email/run.rs` | `--mode matcher\|classification\|full` |
| `bin/eval/email/{list,show}.rs` | matcher runs |

History lands here, not later, because P5 must be comparable against the P4 baseline.

```bash
cargo run --bin eval ... -- email run --corpus-dir ./email_eval_corpus --mode matcher
cargo run --bin eval ... -- email list
cargo run --bin eval ... -- email show <run_id>
```

```
--- Matcher results (200 emails, 30 cases) ---
accuracy@1        58.0%
precision         0.94   recall 0.55   F1 0.69
MRR               0.61
mislink rate      0.0%   ← gate
band confusion    AutoLink→AutoLink 0 | Review→Review 108 | Ignore→Ignore 48 | ...
by difficulty
  easy        49/50  (98%)
  thread      19/20  (95%)
  medium       9/50  (18%)   ← Tier B not built
  hard         2/30  ( 7%)   ← Tier B/C not built
  unrelated   48/50  (96%)
by practice
  litigation  31/60  (52%)
  conveyancing 27/60 (45%)
by signal
  thread_ref 19  case_number 24  land_registry 21  national_id 9  deed 4  sender 12
```

### Exit criteria

- **Mislink rate 0.** Any auto-link to a wrong case fails the run.
- `easy` ≥95%, `thread` ≥90%, `unrelated` + `decoy` ≥95% (i.e. correctly *not* matched). The
  `decoy` half is the one that means something — obvious spam is mostly removed by the
  transactional filter before the matcher ever sees it.
- **Reported per practice area.** Litigation and conveyancing must both clear the bar — an
  aggregate that passes while conveyancing fails is the exact failure P0 predicted.
- `medium`/`hard` expected to be poor — this is the recorded baseline, not a failure.
- Ambiguity guard unit-tested: two cases within `ambiguity_margin` → band demoted to `Review`.
- Run persisted and visible via `eval email list`.
- Manual smoke: real app ingests mail, alerts appear with populated `reason` strings.

### Risks

First phase that changes live behaviour. If the corpus is unrepresentative, real-world false
positives could create alert noise. Mitigation: `review_threshold` starts conservative (0.45) and
`auto_link_enabled` is off; P6 tunes both against data.

---

## P5 — Tier B and Tier C

> **AMI-115** · PR-5 · branch `tsemachmizrachi/ami-115-…`

**Goal:** match emails that carry no hard identifier — the `medium` and `hard` slices.

### Scope

| File | Change |
|---|---|
| `email/case_matcher/tier_b.rs` | **new** — BM25 over `case_text_fts` + `documents_fts` filtered by `documents.case_id` |
| `email/case_matcher/tier_c.rs` | **new** — `strsim` party similarity |
| `email/case_matcher/mod.rs` | wire B and C into `match_email_core` |
| `email/case_matcher/scoring.rs` | content + party weights active |

Tier B reuses `fuzzy::tokens::{exact_term, prefix_term}` and the tiered exact→prefix→LIKE fallback
from `fuzzy/retrieval.rs`. One FTS query serves all cases; results are grouped by case via
`documents.case_id`, top-K per case — no per-case corpus scan and no path logic at match time.

BM25 `rank` normalization (design §5.6) must be verified: SQLite returns negative values, lower is
better, and magnitude varies with term count. Getting this wrong makes content scores
incomparable across emails — worth a dedicated unit test with a hand-checked fixture.

### Eval changes

| File | Change |
|---|---|
| `bin/eval/email/matcher_metrics.rs` | per-signal contribution stats for content/party |
| `bin/eval/email/compare.rs` | **new** — diff two runs |

```bash
cargo run --bin eval ... -- email run --corpus-dir ./email_eval_corpus --mode matcher
cargo run --bin eval ... -- email compare <p4_run_id> <p5_run_id>
```

```
Compare  run 7 (P4 tier-a) → run 12 (P5 tier-abc)
  accuracy@1     58.0% → 84.5%   +26.5
  F1              0.69 →  0.88   +0.19
  mislink          0.0% →  0.0%    0.0   ← must stay 0
  easy            98%  →  98%      0
  thread          95%  →  95%      0
  medium          18%  →  86%    +68     ← Tier B
  hard             7%  →  54%    +47     ← Tier B/C
  unrelated       96%  →  91%     -5     ← watch: content signal adds false positives
  decoy           92%  →  74%    -18     ← the real false-positive cost of Tier B
```

`compare` must surface per-difficulty deltas, because an aggregate gain can hide a regression —
the `unrelated` drop above is exactly the kind of thing to catch.

### Exit criteria

- `medium` ≥80%, `hard` measurably above the P4 baseline (target ≥50%).
- `decoy` does not regress more than 10 points and `unrelated` not more than 5; if either does,
  `review_threshold` needs raising before P6 rather than after. Decoys carry near-miss identifiers,
  so a large drop here means the partial land-registry rule or the ambiguity guard is too loose.
- Mislink rate still 0.
- BM25 normalization unit-tested against hand-computed expectations.

---

## P6 — Tuning, ablation, feedback learning

> **AMI-116** · PR-6 · branch `tsemachmizrachi/ami-116-…`

**Goal:** replace invented constants with data-derived ones, and let the matcher improve with use.

### Scope

| File | Change |
|---|---|
| `bin/eval/email/sweep.rs` | **new** — threshold grid search, `--ablate`, `--apply` |
| `email/emails_alerts.rs` | call `learn_from_confirmed_email` inside `confirm_email_alert` |
| `email/case_matcher/config.rs` | ship tuned defaults |

```bash
cargo run --bin eval ... -- email run --corpus-dir ./c --mode matcher --sweep
cargo run --bin eval ... -- email run --corpus-dir ./c --mode matcher --ablate content
```

Sweep reports both the F1-optimal operating point and the **highest-recall mislink-free** point —
ship the latter. Ablation quantifies each signal's marginal contribution; a signal whose ablation
delta is ~0 is dead weight and should be deleted rather than carried.

Feedback learning is a one-line hook inside the existing confirm path: on confirmation, record the
sender address and thread id as `source='confirmed_email'` identifiers for that case. This is what
closes the cold-start gap (design §10.2).

### Eval changes

Cold-start reporting: run the suite twice, once with learned identifiers disabled, and report both.
Day-one accuracy and steady-state accuracy are different numbers and both should be known.

### Exit criteria

- Shipped `MatcherConfig` defaults come from a recorded sweep run id, noted in the design doc.
- Every signal has a measured non-zero ablation delta, or is removed.
- Confirming an email demonstrably adds identifiers (unit test on `learn_from_confirmed_email`).
- Cold-start vs. steady-state numbers recorded.

---

## Cross-cutting

### Testing per repo convention

80/20 rule: main flow plus the failure modes that matter. Per design §7.6 — normalizer, identifier
mining, Tier A per-signal, Tier B grouping/normalization, band boundaries, ambiguity demotion,
attachment failure modes, and one small end-to-end fixture. Not exhaustive edge coverage.

Unit tests live inline (`#[cfg(test)]`) alongside the code, matching the existing pattern in
`emails_classify_deterministic.rs`; integration tests go in `tests/email/`.

### What stays untouched

Frontend, Tauri command surface, attachment staging/import/display, the alert list, and the LLM
provider stack. The only Tauri-facing change in the whole plan is which implementation
`resolve_case_api` returns (P4), and `CaseMatchRequest`/`CaseMatchResult` keep their current shapes
so no caller changes.

### LLM code

Stays compiled and callable throughout. P4 introduces the mode switch; `Deterministic` is the
default and never calls `llm_provider_from_app`. `--mode classification` and `--mode full` keep the
existing LLM eval paths runnable for comparison.

### Rollback

Each phase is independently revertable. P1/P2/P3 change no runtime behaviour (P2 and P3 add data
and inputs the stub matcher ignores). P4 is the first behavioural change and is gated by
`EmailPipelineMode` — reverting to the stub is a one-line change in `resolve_case_api`.

### Suggested commit/PR boundaries

One PR per phase, titled with the Linear ticket. P2 and P4 are the large ones and could each split:

- P2a schema + identifiers, P2b document linking + `eval email index`
- P4a `match_email_core` + Tier A + scoring, P4b eval runner + metrics + history

Split only if review load demands it — the phase exit criteria assume both halves are present.
