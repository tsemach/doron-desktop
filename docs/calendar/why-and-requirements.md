# Calendar Support — Why & Requirements

Source: [ASC-163](https://linear.app/amicusx/issue/ASC-163/add-calendar-support) ("Add calendar support"). This document reorganizes the raw issue (a flat 10-item list) into a motivation and a clarified, resolved requirements list. It's the first of four companion documents:

1. **why-and-requirements.md** (this file) — why, and what, precisely
2. [`brainstorm.md`](./brainstorm.md) — approaches considered, trade-offs, chosen option per decision
3. [`design.md`](./design.md) — the technical design
4. [`plan.md`](./plan.md) — phased, stacked implementation plan

## Why

Attorneys using Ascurix already live in Google Calendar for scheduling — court dates, client consultations, opposing-counsel calls — but that calendar has no connection to the case files sitting in Ascurix. Two problems fall out of that gap:

1. **No case context at a glance.** Opening a case in Ascurix today shows documents, emails, and tasks, but not "what meetings are coming up for this case" — an attorney has to cross-reference their calendar by hand, or maintain the mapping in their head.
2. **Nothing in Ascurix reminds anyone a meeting is imminent.** The app has no notion of time-sensitive events at all today (tasks have due dates, but no reminder mechanism fires from them either).

The goal of this feature isn't to replace Google Calendar — it's to make Ascurix aware of the meetings that already live there, let cases and meetings reference each other, and surface that inside the workflows attorneys already use (case details, the home overview) without asking them to trust a second, competing calendar. That's why Google Calendar is kept as the single source of truth rather than building a parallel scheduling system: Ascurix mirrors and enriches it, it doesn't fork it.

## Scope for this round

This issue bundles several materially different subsystems (new navigation surface, a full calendar UI, two-way external sync, text-based entity extraction, a background reminder scheduler, and two separate case-detail integration points). Per discussion, this round produces **one design covering the full feature**, delivered as a **phased stack of independently-reviewable PRs** (see [`plan.md`](./plan.md)) — the same approach taken for [ASC-91](../task-management/plan.md) (task management).

## Requirements (clarified)

Each item below is the original ask, reworded precisely and annotated with the decision made where the original issue left it ambiguous. Decisions were made interactively; see [`brainstorm.md`](./brainstorm.md) for the trade-offs behind each one.

### R1 — New "Calendar" main tab
A third top-level entry point alongside "Cases" and "Documents" (home-page tile + `/calendar` route), following the same navigation shape those two already use.

### R2 — Day / week / month views
Standard calendar grid views, switchable, showing synced meetings.

### R3 — Google Calendar is the source of truth
- Google Calendar connection is **required** to use the Calendar tab at all — there is no local-only/offline mode. This avoids ever having to reconcile a local-only meeting with what Google says is true.
- Creating a meeting in Ascurix **writes through to Google immediately** (calls Google's API synchronously on save); the local `meetings` table is a mirror of Google, kept current by a periodic incremental sync, never an independent record.
- Edits or cancellations made directly in Google Calendar (outside Ascurix) are picked up by that same sync and reflected locally.

### R4 — Create a meeting from within the app
A create/edit form inside the Calendar tab. On save: parse the description (R5), write to Google, mirror locally.

### R5 — Auto-link a meeting to a case via description text
If a meeting's description contains `"case: <name>"` or `"תיק: <name>"`, extract `<name>` and attempt to match it to an existing case.
- **Matching is near-exact only** (normalized string comparison, reusing the existing Hebrew/English normalizer) — no fuzzy/confidence-tiered matching. A phrase that doesn't match closely enough leaves the meeting unlinked; the user can attach a case manually in the form.
- **Task attachment is out of scope** — the original issue mentioned attaching a meeting to "a case or a specific task," but only defined a phrase for the case. Task-level attachment is dropped from this issue entirely (not deferred, not designed) per explicit decision.

### R6 — Pre-meeting notification
An OS-level notification pops when a meeting is about to start, so it's visible even if the Ascurix window is minimized or backgrounded. This only fires while the Ascurix desktop app is running — there's no always-on background service.

### R7 — Case details: meetings view
A calendar-icon entry point in case details shows that case's meetings as a **boxes/list view** (not the day/week/month grid) — rendered as another same-panel view alongside the existing Overview / Preview / Emails / Tasks panels (i.e. a panel switch, **not a modal popup**).

### R8 — Case overview shows detected meetings
The case's Overview panel additionally gets a small "Upcoming Meetings" card (mirroring the existing tasks/emails overview cards), so a case-linked meeting is visible without navigating to the meetings view from R7.

### R9 — Home page shows today's meetings
The home page's cross-case overview panel gets a "Today's Meetings" card, alongside the existing Open Tasks / Follow-ups / Needs Assignment cards.

## Non-goals — explicitly out of scope

- **Task-level attachment to a meeting.** See R5 — dropped from this issue.
- **Local-only / offline meeting creation.** Google connection is mandatory; see R3.
- **Fuzzy or confidence-scored case matching** for the description phrase. See R5 — near-exact only.
- **Recurring meetings.** Creating a *new* recurring series from Ascurix is out of scope for this round; a recurring event that already exists in Google still syncs in as Google expands it into individual instances. Flagged as a likely fast-follow issue.
- **Multi-calendar support.** One connected Google account, its primary calendar only — matching the existing OAuth spike (`python/calender.py`).
- **Notifications while Ascurix isn't running.** No system-tray/always-on service is being built.
- **Tier gating.** Unlike `emails`/`ai_features` (Pro-only), Calendar is available on every subscription tier — decided explicitly, not a default carried over from those features.

## Known repo hygiene note (unrelated, flagged in passing)

Three files at the repo root look like real Google Cloud OAuth credentials and are currently **untracked but not gitignored**: `client_secret_67456715769-4ofvc7hufqs2rbd4su7pmbipibr8edev.apps.googleusercontent.com.json`, `ascurix-portal-credentials.json`, `doron-portal-credentials.json`. Only `credentials.json`/`token.json` (the filenames used by the `python/calender.py` spike) are gitignored so far. Left as-is per explicit decision — noted here so it doesn't get lost.
