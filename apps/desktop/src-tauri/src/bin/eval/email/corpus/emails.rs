//! Email fixture synthesis, one builder per difficulty slice.

use std::collections::BTreeMap;

use super::cases::shared_party_pairs;
use super::pools::*;
use super::{
    Band, CorpusCase, CorpusConfig, Difficulty, EmailFixture, Expected, ExpectedSignals,
    FixtureAttachment,
};
use crate::email::rng::Rng;

/// Share of the non-`unrelated` remainder, per difficulty. Sums to 100.
const EASY: usize = 30;
const MEDIUM: usize = 30;
const HARD: usize = 22;
const THREAD: usize = 10;
const ADVERSARIAL: usize = 8;

fn received_at(index: usize) -> String {
    // Deterministic, ordered, and valid RFC3339 — thread replies must sort after their
    // parent, so the timestamp is derived from the fixture index rather than the clock.
    let day = 1 + (index % 27);
    let hour = 6 + (index % 12);
    format!("2026-03-{day:02}T{hour:02}:15:00Z")
}

fn message_id(id: &str) -> String {
    format!("<{id}@corpus.test>")
}

/// A plausible misspelling: Hebrew hyphenated compound, or a doubled letter for Latin.
fn spelling_variant(name: &str, rng: &mut Rng) -> String {
    let mut parts = name.split_whitespace();
    let first = parts.next().unwrap_or(name);
    let last = parts.next().unwrap_or("");
    if last.is_empty() {
        return format!("{first}׳");
    }
    if rng.chance(0.5) {
        format!("{first} {last}-{}", rng.choose(FAMILY_NAMES_HE))
    } else {
        format!("{first} {}", last.chars().rev().collect::<String>())
    }
}

fn land_registry_prose(composite: &str) -> String {
    let parts: Vec<&str> = composite.split('/').collect();
    let mut s = format!("גוש {} חלקה {}", parts[0], parts[1]);
    if let Some(t) = parts.get(2) {
        s.push_str(&format!(" תת חלקה {t}"));
    }
    s
}

fn sender_for(case: &CorpusCase, rng: &mut Rng) -> (String, Option<String>) {
    let email = if case.planted.emails.is_empty() {
        "unknown@example.com".to_string()
    } else {
        rng.choose(&case.planted.emails).clone()
    };
    let name = case.planted.party_names.first().cloned();
    (email, name)
}

fn attachment_for(
    case: &CorpusCase,
    fixture_id: &str,
    include_identifier: bool,
    rng: &mut Rng,
) -> FixtureAttachment {
    let title = rng.choose(doc_titles_for(case.practice.is_conveyancing()));
    let mut paragraphs = vec![title.to_string(), case.subject.clone()];

    if include_identifier {
        if let Some(cn) = &case.planted.case_number {
            paragraphs.push(format!("מספר תיק: {cn}"));
        }
        if let Some(lr) = &case.planted.land_registry {
            paragraphs.push(land_registry_prose(lr));
        }
        if let Some(id) = case.planted.national_ids.first() {
            paragraphs.push(format!("ת.ז: {id}"));
        }
    }
    for word in rng.sample(&case.planted.vocabulary, 3) {
        paragraphs.push(format!("סעיף בעניין {word}."));
    }

    let name = format!("{}_{}.docx", title.replace(' ', "_"), fixture_id);
    FixtureAttachment {
        path: format!("attachments/{name}"),
        name,
        paragraphs,
    }
}

struct Ctx<'a> {
    config: &'a CorpusConfig,
    cases: &'a [CorpusCase],
}

fn build_easy(rng: &mut Rng, ctx: &Ctx, id: &str, index: usize) -> EmailFixture {
    let case = &ctx.cases[rng.below(ctx.cases.len())];
    let (sender, sender_name) = sender_for(case, rng);
    let mut signals = ExpectedSignals::default();

    let (subject, signal) = if let Some(cn) = &case.planted.case_number {
        signals.case_numbers.push(cn.clone());
        (format!("עדכון בתיק {cn} — {}", case.topic), "case_number")
    } else {
        let lr = case.planted.land_registry.clone().unwrap_or_default();
        signals.land_registry.push(lr.clone());
        (
            format!("{} — {}", case.subject, land_registry_prose(&lr)),
            "land_registry",
        )
    };

    let mut body = format!("שלום,\n\nבהמשך לשיחתנו בעניין {}.\n", case.topic);
    if let Some(deed) = &case.planted.deed {
        body.push_str(&format!("מצורף שטר {deed}.\n"));
        signals.deeds.push(deed.clone());
    }
    body.push_str("\nבברכה");
    signals.emails.push(sender.clone());

    let attachments = if ctx.config.with_attachments && rng.chance(0.4) {
        vec![attachment_for(case, id, true, rng)]
    } else {
        vec![]
    };

    EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name,
        subject,
        body_text: body,
        received_at: received_at(index),
        in_reply_to: None,
        references: vec![],
        attachments,
        expected: Expected {
            case_id: Some(case.id),
            practice: Some(case.practice),
            difficulty: Difficulty::Easy,
            signal: signal.to_string(),
            band: Band::AutoLink,
            competing_case_id: None,
            signals,
        },
    }
}

/// No identifier in the subject or body — a known sender plus vocabulary the case's
/// documents also use. A fraction put the identifier **only** in an attachment, which
/// is the sharpest test that attachment text reaches the matcher at all.
fn build_medium(rng: &mut Rng, ctx: &Ctx, id: &str, index: usize) -> EmailFixture {
    let case = &ctx.cases[rng.below(ctx.cases.len())];
    let (sender, sender_name) = sender_for(case, rng);
    let mut signals = ExpectedSignals::default();
    signals.emails.push(sender.clone());

    let identifier_in_attachment = ctx.config.with_attachments && rng.chance(0.35);

    let vocab: Vec<String> = rng
        .sample(&case.planted.vocabulary, 3)
        .into_iter()
        .cloned()
        .collect();
    let subject = format!("בעניין {}", vocab.first().cloned().unwrap_or_default());
    let body = format!(
        "שלום,\n\nרציתי לעדכן בנוגע ל{}. {} עדיין פתוחים ונשמח להתקדם.\n\nתודה",
        vocab.first().cloned().unwrap_or_default(),
        vocab.join(" ו")
    );

    let attachments = if identifier_in_attachment {
        let att = attachment_for(case, id, true, rng);
        // The identifier lives in the attachment, so the expected signals must list it —
        // extraction has to reach into the file to satisfy this fixture.
        if let Some(cn) = &case.planted.case_number {
            signals.case_numbers.push(cn.clone());
        }
        if let Some(lr) = &case.planted.land_registry {
            signals.land_registry.push(lr.clone());
        }
        vec![att]
    } else if ctx.config.with_attachments && rng.chance(0.3) {
        vec![attachment_for(case, id, false, rng)]
    } else {
        vec![]
    };

    EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name,
        subject,
        body_text: body,
        received_at: received_at(index),
        in_reply_to: None,
        references: vec![],
        attachments,
        expected: Expected {
            case_id: Some(case.id),
            practice: Some(case.practice),
            difficulty: Difficulty::Medium,
            signal: if identifier_in_attachment {
                "attachment_identifier".to_string()
            } else {
                "sender_and_content".to_string()
            },
            band: Band::Review,
            competing_case_id: None,
            signals,
        },
    }
}

/// Party names only, misspelled, with wording that deliberately avoids the vocabulary
/// used in the case documents — the vocabulary-drift scenario.
fn build_hard(rng: &mut Rng, ctx: &Ctx, id: &str, index: usize) -> EmailFixture {
    let case = &ctx.cases[rng.below(ctx.cases.len())];
    let party = case
        .planted
        .party_names
        .first()
        .cloned()
        .unwrap_or_else(|| "לקוח".to_string());
    let variant = spelling_variant(&party, rng);
    let drift = rng
        .sample(&case.planted.drift, 2)
        .into_iter()
        .cloned()
        .collect::<Vec<_>>();

    // Deliberately a neutral address the case has never seen.
    let sender = format!("private{}@{}", rng.range(10, 999), rng.choose(NEUTRAL_DOMAINS));

    let mut signals = ExpectedSignals::default();
    // NOT recorded as an expected `party_names` signal: the deterministic extractor
    // matches adversarial *pairs* ("X נ' Y"), never a standalone name in prose — that
    // needs NER and would flag every capitalised word pair. The variant reaches the
    // matcher through `sender_name` instead, which is what Tier C fuzzy-matches against
    // the case's party identifiers.
    signals.emails.push(sender.clone());

    EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name: Some(variant.clone()),
        subject: format!("שאלה לגבי {}", drift.first().cloned().unwrap_or_default()),
        body_text: format!(
            "היי,\n\nמדבר {variant}. רציתי לברר מה קורה עם {}. אשמח לעדכון.\n\nתודה רבה",
            drift.join(" ועם ")
        ),
        received_at: received_at(index),
        in_reply_to: None,
        references: vec![],
        attachments: vec![],
        expected: Expected {
            case_id: Some(case.id),
            practice: Some(case.practice),
            difficulty: Difficulty::Hard,
            signal: "party_name_fuzzy".to_string(),
            band: Band::Review,
            competing_case_id: None,
            signals,
        },
    }
}

fn build_thread(
    rng: &mut Rng,
    ctx: &Ctx,
    id: &str,
    index: usize,
    prior: &BTreeMap<i64, Vec<String>>,
) -> Option<EmailFixture> {
    // Only cases that already have a message can be replied to.
    let candidates: Vec<&i64> = prior.keys().collect();
    if candidates.is_empty() {
        return None;
    }
    let case_id = **rng.choose(&candidates);
    let case = ctx.cases.iter().find(|c| c.id == case_id)?;
    let thread = prior.get(&case_id)?;
    let parent = rng.choose(thread).clone();

    let (sender, sender_name) = sender_for(case, rng);
    let mut signals = ExpectedSignals::default();
    signals.emails.push(sender.clone());

    Some(EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name,
        subject: format!("Re: {}", case.topic),
        body_text: "תודה על העדכון. מתי נוכל לקבוע פגישה?\n\nבברכה".to_string(),
        received_at: received_at(index),
        in_reply_to: Some(parent.clone()),
        references: vec![parent],
        attachments: vec![],
        expected: Expected {
            case_id: Some(case.id),
            practice: Some(case.practice),
            difficulty: Difficulty::Thread,
            signal: "thread_ref".to_string(),
            band: Band::AutoLink,
            competing_case_id: None,
            signals,
        },
    })
}

/// Names a party that belongs to two cases and nothing else — the matcher must decline
/// to auto-link. This is the fixture that exercises the ambiguity guard.
fn build_adversarial(rng: &mut Rng, ctx: &Ctx, id: &str, index: usize) -> Option<EmailFixture> {
    let pairs = shared_party_pairs(ctx.cases);
    if pairs.is_empty() {
        return None;
    }
    let (a, b, shared) = rng.choose(&pairs).clone();

    let sender = format!("info{}@{}", rng.range(10, 999), rng.choose(NEUTRAL_DOMAINS));
    let mut signals = ExpectedSignals::default();
    // Same as `hard`: the shared party arrives via sender_name, not as an extracted
    // party_names signal.
    signals.emails.push(sender.clone());

    Some(EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name: Some(shared.clone()),
        subject: format!("בקשה בעניין {shared}"),
        body_text: format!(
            "שלום,\n\nאני פונה בנוגע ל{shared}. נא לעדכן בהקדם.\n\nבתודה"
        ),
        received_at: received_at(index),
        in_reply_to: None,
        references: vec![],
        attachments: vec![],
        expected: Expected {
            case_id: Some(a),
            practice: None,
            difficulty: Difficulty::Adversarial,
            signal: "shared_party".to_string(),
            band: Band::Review,
            competing_case_id: Some(b),
            signals,
        },
    })
}

fn build_unrelated(rng: &mut Rng, id: &str, index: usize) -> EmailFixture {
    let sender = rng.choose(UNRELATED_SENDERS).to_string();
    let mut signals = ExpectedSignals::default();
    signals.emails.push(sender.clone());

    EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name: None,
        subject: rng.choose(UNRELATED_SUBJECTS).to_string(),
        body_text: rng.choose(UNRELATED_BODIES).to_string(),
        received_at: received_at(index),
        in_reply_to: None,
        references: vec![],
        attachments: vec![],
        expected: Expected {
            case_id: None,
            practice: None,
            difficulty: Difficulty::Unrelated,
            signal: "none".to_string(),
            band: Band::Ignore,
            competing_case_id: None,
            signals,
        },
    }
}


/// Every land-registry `gush/helka` pair and case number in use, so a decoy's
/// near-miss identifier can be checked not to collide with a real case.
fn taken_identifiers(cases: &[CorpusCase]) -> (Vec<(String, String)>, Vec<String>) {
    let mut plots = Vec::new();
    let mut numbers = Vec::new();
    for c in cases {
        if let Some(lr) = &c.planted.land_registry {
            let parts: Vec<&str> = lr.split('/').collect();
            plots.push((parts[0].to_string(), parts[1].to_string()));
        }
        if let Some(cn) = &c.planted.case_number {
            numbers.push(cn.clone());
        }
    }
    (plots, numbers)
}

/// Business-like mail that belongs to no case. This is what actually measures
/// false-positive risk: the `unrelated` slice is mostly removed by the transactional
/// filter before the matcher runs, and what survives shares no vocabulary with any
/// case, so it scores zero for free. Decoys use real legal vocabulary, a plausible
/// sender, and sometimes an identifier that is one digit or one parcel away from a
/// real one — which is what the ambiguity guard and partial land-registry rules exist
/// to reject.
fn build_decoy(rng: &mut Rng, ctx: &Ctx, id: &str, index: usize) -> EmailFixture {
    let borrowed = &ctx.cases[rng.below(ctx.cases.len())];
    let (plots, numbers) = taken_identifiers(ctx.cases);
    let mut signals = ExpectedSignals::default();

    // A sender the corpus has never associated with any case.
    let sender = format!("inquiry{}@{}", rng.range(1000, 9999), rng.choose(NEUTRAL_DOMAINS));
    signals.emails.push(sender.clone());

    let mut near_miss = None;
    if rng.chance(0.45) {
        if let Some(lr) = &borrowed.planted.land_registry {
            // Same block, a parcel nobody owns — a partial match that must not link.
            let gush = lr.split('/').next().unwrap_or("0").to_string();
            for _ in 0..64 {
                let helka = rng.range(1, 300).to_string();
                if !plots.iter().any(|(g, h)| g == &gush && h == &helka) {
                    let composite = format!("{gush}/{helka}");
                    signals.land_registry.push(composite.clone());
                    near_miss = Some(format!("גוש {gush} חלקה {helka}"));
                    break;
                }
            }
        } else if let Some(cn) = &borrowed.planted.case_number {
            // A case number one digit off from a real one.
            let (num, year) = cn.split_once('/').unwrap_or(("1000", "24"));
            for _ in 0..64 {
                let candidate = format!("{}/{year}", rng.range(1000, 99_999));
                if candidate != *cn && !numbers.contains(&candidate) {
                    signals.case_numbers.push(candidate.clone());
                    near_miss = Some(format!("תיק {candidate}"));
                    break;
                }
            }
            let _ = num;
        }
    }

    let vocab: Vec<String> = rng
        .sample(&borrowed.planted.vocabulary, 2)
        .into_iter()
        .cloned()
        .collect();
    let opener = rng.choose(DECOY_OPENERS);
    let context = rng.choose(DECOY_CONTEXTS);
    let closing = rng.choose(DECOY_CLOSINGS);

    let subject = format!("{opener} — {}", vocab.first().cloned().unwrap_or_default());
    let mut body = format!("שלום רב,\n\n{context}. אני פונה בנוגע ל{}.\n", vocab.join(" ול"));
    if let Some(nm) = &near_miss {
        body.push_str(&format!("מדובר ב{nm}.\n"));
    }
    body.push_str(&format!("\n{closing}"));

    EmailFixture {
        id: id.to_string(),
        message_id: message_id(id),
        sender,
        sender_name: None,
        subject,
        body_text: body,
        received_at: received_at(index),
        in_reply_to: None,
        references: vec![],
        attachments: vec![],
        expected: Expected {
            case_id: None,
            practice: None,
            difficulty: Difficulty::Decoy,
            signal: if near_miss.is_some() {
                "decoy_near_miss".to_string()
            } else {
                "decoy_vocabulary".to_string()
            },
            band: Band::Ignore,
            competing_case_id: None,
            signals,
        },
    }
}

fn plan(total: usize, unrelated_ratio: f64, decoy_share: f64) -> Vec<Difficulty> {
    let not_related = (total as f64 * unrelated_ratio).round() as usize;
    let decoy = (not_related as f64 * decoy_share).round() as usize;
    let unrelated = not_related.saturating_sub(decoy);
    let remainder = total.saturating_sub(not_related);

    let mut plan = Vec::with_capacity(total);
    let push = |d: Difficulty, share: usize, plan: &mut Vec<Difficulty>| {
        let n = remainder * share / 100;
        for _ in 0..n {
            plan.push(d);
        }
    };
    push(Difficulty::Easy, EASY, &mut plan);
    push(Difficulty::Medium, MEDIUM, &mut plan);
    push(Difficulty::Hard, HARD, &mut plan);
    push(Difficulty::Thread, THREAD, &mut plan);
    push(Difficulty::Adversarial, ADVERSARIAL, &mut plan);
    for _ in 0..unrelated {
        plan.push(Difficulty::Unrelated);
    }
    for _ in 0..decoy {
        plan.push(Difficulty::Decoy);
    }
    // Integer division can leave a shortfall; top up with the largest slice.
    while plan.len() < total {
        plan.push(Difficulty::Easy);
    }
    plan.truncate(total);
    plan
}

pub fn build_emails(
    rng: &mut Rng,
    config: &CorpusConfig,
    cases: &[CorpusCase],
) -> Vec<EmailFixture> {
    let ctx = Ctx { config, cases };
    // Thread replies need a parent, so the plan is ordered (not shuffled) and thread
    // fixtures come after the easy/medium ones that seed each case's history.
    let plan = plan(config.emails, config.unrelated_ratio, config.decoy_share);

    let mut prior: BTreeMap<i64, Vec<String>> = BTreeMap::new();
    let mut out: Vec<EmailFixture> = Vec::with_capacity(config.emails);

    for (index, difficulty) in plan.into_iter().enumerate() {
        let id = format!("em_{:04}", index + 1);
        let fixture = match difficulty {
            Difficulty::Easy => Some(build_easy(rng, &ctx, &id, index)),
            Difficulty::Medium => Some(build_medium(rng, &ctx, &id, index)),
            Difficulty::Hard => Some(build_hard(rng, &ctx, &id, index)),
            Difficulty::Thread => build_thread(rng, &ctx, &id, index, &prior),
            Difficulty::Adversarial => build_adversarial(rng, &ctx, &id, index),
            Difficulty::Unrelated => Some(build_unrelated(rng, &id, index)),
            Difficulty::Decoy => Some(build_decoy(rng, &ctx, &id, index)),
        };

        // Thread/adversarial can legitimately be unbuildable (no parent yet, no shared
        // party); fall back to `easy` so the requested email count is still honoured.
        let fixture = fixture.unwrap_or_else(|| build_easy(rng, &ctx, &id, index));

        if let Some(case_id) = fixture.expected.case_id {
            if fixture.expected.difficulty != Difficulty::Adversarial {
                prior
                    .entry(case_id)
                    .or_default()
                    .push(fixture.message_id.clone());
            }
        }
        out.push(fixture);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::corpus::{cases::build_cases, test_config};

    fn corpus() -> (Vec<CorpusCase>, Vec<EmailFixture>) {
        let cfg = test_config();
        let mut rng = Rng::new(cfg.seed);
        let cases = build_cases(&mut rng, &cfg);
        let emails = build_emails(&mut rng, &cfg, &cases);
        (cases, emails)
    }

    #[test]
    fn produces_the_requested_count() {
        let (_, emails) = corpus();
        assert_eq!(emails.len(), test_config().emails);
    }

    #[test]
    fn every_expected_case_id_resolves() {
        let (cases, emails) = corpus();
        for e in &emails {
            if let Some(id) = e.expected.case_id {
                assert!(cases.iter().any(|c| c.id == id), "dangling case_id in {}", e.id);
            }
        }
    }

    #[test]
    fn unrelated_fixtures_have_no_case() {
        let (_, emails) = corpus();
        let unrelated: Vec<_> = emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Unrelated)
            .collect();
        assert!(!unrelated.is_empty());
        for e in unrelated {
            assert!(e.expected.case_id.is_none());
            assert_eq!(e.expected.band, Band::Ignore);
        }
    }

    #[test]
    fn thread_fixtures_reference_a_real_prior_message() {
        let (_, emails) = corpus();
        let ids: Vec<&str> = emails.iter().map(|e| e.message_id.as_str()).collect();
        for e in emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Thread)
        {
            let parent = e.in_reply_to.as_ref().expect("thread needs in_reply_to");
            assert!(ids.contains(&parent.as_str()), "dangling parent in {}", e.id);
        }
    }

    #[test]
    fn adversarial_fixtures_name_two_competing_cases() {
        let (_, emails) = corpus();
        for e in emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Adversarial)
        {
            assert_eq!(e.expected.band, Band::Review);
            assert!(e.expected.competing_case_id.is_some());
            assert_ne!(e.expected.case_id, e.expected.competing_case_id);
        }
    }

    #[test]
    fn hard_fixtures_avoid_the_case_vocabulary() {
        let (cases, emails) = corpus();
        for e in emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Hard)
        {
            let case = cases
                .iter()
                .find(|c| Some(c.id) == e.expected.case_id)
                .unwrap();
            let text = format!("{} {}", e.subject, e.body_text);
            for word in &case.planted.vocabulary {
                assert!(
                    !text.contains(word.as_str()),
                    "hard fixture {} leaked document vocabulary {word:?}",
                    e.id
                );
            }
        }
    }

    #[test]
    fn some_fixtures_hide_the_identifier_in_an_attachment() {
        let (_, emails) = corpus();
        let hidden = emails
            .iter()
            .filter(|e| e.expected.signal == "attachment_identifier")
            .count();
        assert!(hidden > 0, "no attachment-only identifier fixtures generated");
    }

    #[test]
    fn difficulty_plan_sums_to_total() {
        for total in [10, 37, 60, 200] {
            assert_eq!(plan(total, 0.25, 0.4).len(), total);
        }
    }

    #[test]
    fn decoys_belong_to_no_case_and_are_ignorable() {
        let (_, emails) = corpus();
        let decoys: Vec<_> = emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Decoy)
            .collect();
        assert!(!decoys.is_empty(), "no decoy fixtures generated");
        for e in decoys {
            assert!(e.expected.case_id.is_none(), "decoy {} claims a case", e.id);
            assert_eq!(e.expected.band, Band::Ignore);
        }
    }

    /// The whole point of a decoy is that it reaches the matcher. `is_transactional_or_spam`
    /// runs first in the real pipeline, so a decoy whose subject trips the blocklist would
    /// be filtered out and measure nothing.
    #[test]
    fn decoy_subjects_survive_the_transactional_filter() {
        let (_, emails) = corpus();
        for e in emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Decoy)
        {
            let subject = e.subject.to_lowercase();
            for keyword in tauri_app_lib::email::BLOCKED_SUBJECT_KEYWORDS {
                assert!(
                    !subject.contains(&keyword.to_lowercase()),
                    "decoy {} subject {:?} trips the spam blocklist on {keyword:?}",
                    e.id,
                    e.subject
                );
            }
        }
    }

    /// A near-miss identifier must be genuinely near-miss: extractable, but belonging to
    /// no real case. If it collided, the fixture would be unfair rather than adversarial.
    #[test]
    fn decoy_near_miss_identifiers_match_no_real_case() {
        let (cases, emails) = corpus();
        let real_plots: Vec<(String, String)> = cases
            .iter()
            .filter_map(|c| c.planted.land_registry.as_ref())
            .map(|lr| {
                let p: Vec<&str> = lr.split('/').collect();
                (p[0].to_string(), p[1].to_string())
            })
            .collect();
        let real_numbers: Vec<&String> = cases
            .iter()
            .filter_map(|c| c.planted.case_number.as_ref())
            .collect();

        let mut near_miss_seen = 0;
        for e in emails
            .iter()
            .filter(|e| e.expected.signal == "decoy_near_miss")
        {
            near_miss_seen += 1;
            for lr in &e.expected.signals.land_registry {
                let p: Vec<&str> = lr.split('/').collect();
                let pair = (p[0].to_string(), p[1].to_string());
                assert!(
                    !real_plots.contains(&pair),
                    "decoy {} near-miss plot {lr} belongs to a real case",
                    e.id
                );
            }
            for cn in &e.expected.signals.case_numbers {
                assert!(
                    !real_numbers.contains(&cn),
                    "decoy {} near-miss case number {cn} belongs to a real case",
                    e.id
                );
            }
        }
        assert!(near_miss_seen > 0, "no near-miss decoys generated");
    }

    /// Decoys must share vocabulary with some case's documents — that overlap is what
    /// makes them a real test of Tier B rather than a free zero.
    #[test]
    fn decoys_share_vocabulary_with_the_case_corpus() {
        let (cases, emails) = corpus();
        let all_vocab: Vec<&String> = cases
            .iter()
            .flat_map(|c| &c.planted.vocabulary)
            .collect();
        for e in emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Decoy)
        {
            let text = format!("{} {}", e.subject, e.body_text);
            assert!(
                all_vocab.iter().any(|v| text.contains(v.as_str())),
                "decoy {} shares no vocabulary with any case",
                e.id
            );
        }
    }

    /// A decoy sender must be unknown to every case, or Tier A's sender signal would
    /// legitimately fire and the fixture would be testing the wrong thing.
    #[test]
    fn decoy_senders_are_not_known_to_any_case() {
        let (cases, emails) = corpus();
        let known: Vec<&String> = cases.iter().flat_map(|c| &c.planted.emails).collect();
        for e in emails
            .iter()
            .filter(|e| e.expected.difficulty == Difficulty::Decoy)
        {
            assert!(
                !known.contains(&&e.sender),
                "decoy {} uses a sender a case already knows",
                e.id
            );
        }
    }
}
