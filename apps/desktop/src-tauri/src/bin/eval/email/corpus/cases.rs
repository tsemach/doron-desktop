//! Case synthesis: metadata, compound-named fields, and document bodies.

use super::pools::*;
use super::{CaseField, CorpusCase, CorpusConfig, Lang, Planted, Practice};
use crate::email::rng::Rng;

/// Israeli national ID: 8 random digits plus the standard check digit, so generated
/// values pass a real `ת.ז` validator rather than only matching a regex.
fn national_id(rng: &mut Rng) -> String {
    let mut digits: Vec<u32> = (0..8).map(|_| rng.below(10) as u32).collect();
    let mut sum = 0;
    for (i, d) in digits.iter().enumerate() {
        let mut v = d * if i % 2 == 0 { 1 } else { 2 };
        if v > 9 {
            v -= 9;
        }
        sum += v;
    }
    let check = (10 - (sum % 10)) % 10;
    digits.push(check);
    digits.iter().map(|d| d.to_string()).collect()
}

fn phone(rng: &mut Rng) -> String {
    format!("05{}-{:07}", rng.below(10), rng.range(1_000_000, 9_999_999))
}

fn case_number(rng: &mut Rng) -> String {
    format!("{}/{}", rng.range(1000, 99_999), rng.range(15, 26))
}

/// Canonical composite `gush/helka[/tat]` — the same shape the matcher will index.
fn land_registry(rng: &mut Rng) -> (String, u64, u64, Option<u64>) {
    let gush = rng.range(100, 9999);
    let helka = rng.range(1, 300);
    let tat = if rng.chance(0.65) {
        Some(rng.range(1, 60))
    } else {
        None
    };
    let composite = match tat {
        Some(t) => format!("{gush}/{helka}/{t}"),
        None => format!("{gush}/{helka}"),
    };
    (composite, gush, helka, tat)
}

fn person_name(rng: &mut Rng, lang: Lang) -> String {
    let english = match lang {
        Lang::En => true,
        Lang::He => false,
        Lang::Mixed => rng.chance(0.25),
    };
    if english {
        format!(
            "{} {}",
            rng.choose(GIVEN_NAMES_EN),
            rng.choose(FAMILY_NAMES_EN)
        )
    } else {
        format!(
            "{} {}",
            rng.choose(GIVEN_NAMES_HE),
            rng.choose(FAMILY_NAMES_HE)
        )
    }
}

fn slugify_email_local(name: &str, rng: &mut Rng) -> String {
    // Hebrew names cannot appear in an address local-part; fall back to a stable
    // transliteration-ish token so senders still look plausible.
    let ascii: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    if ascii.len() >= 3 {
        ascii
    } else {
        format!("user{}", rng.range(100, 999))
    }
}

fn contact_email(rng: &mut Rng, name: &str, professional: bool) -> String {
    let local = slugify_email_local(name, rng);
    let domain = if professional {
        rng.choose(LAW_FIRM_DOMAINS)
    } else {
        rng.choose(NEUTRAL_DOMAINS)
    };
    format!("{local}@{domain}")
}

fn conveyancing_fields(
    rng: &mut Rng,
    planted: &mut Planted,
    config: &CorpusConfig,
    parties_from: &[String],
    parties_to: &[String],
) -> Vec<CaseField> {
    let mut fields = Vec::new();
    let (composite, gush, helka, tat) = land_registry(rng);
    planted.land_registry = Some(composite);

    // Compound `role:field:index` naming, matching the real profile.
    fields.push(CaseField {
        name: "גוש ספר:1".to_string(),
        value: gush.to_string(),
    });
    fields.push(CaseField {
        name: "חלקה דף:1".to_string(),
        value: helka.to_string(),
    });
    if let Some(t) = tat {
        fields.push(CaseField {
            name: "תת חלקה:1".to_string(),
            value: t.to_string(),
        });
    }

    if rng.chance(0.5) {
        let deed = rng.range(1000, 99_999).to_string();
        fields.push(CaseField {
            name: "שטר".to_string(),
            value: deed.clone(),
        });
        planted.deed = Some(deed);
    }

    for (idx, name) in parties_from.iter().enumerate() {
        let id = national_id(rng);
        fields.push(CaseField {
            name: format!("מאת:שם מלא:{}", idx + 1),
            value: name.clone(),
        });
        fields.push(CaseField {
            name: format!("מאת:ת.ז:{}", idx + 1),
            value: id.clone(),
        });
        planted.national_ids.push(id);
    }
    for (idx, name) in parties_to.iter().enumerate() {
        let id = national_id(rng);
        fields.push(CaseField {
            name: format!("מקבל:שם מלא:{}", idx + 1),
            value: name.clone(),
        });
        fields.push(CaseField {
            name: format!("מקבל:ת.ז:{}", idx + 1),
            value: id.clone(),
        });
        planted.national_ids.push(id);
    }

    fields.push(CaseField {
        name: "לשכת-רישום".to_string(),
        value: rng.choose(REGISTRY_BUREAUS).to_string(),
    });
    fields.push(CaseField {
        name: "ישוב".to_string(),
        value: rng.choose(CITIES_HE).to_string(),
    });

    let lawyer = person_name(rng, config.lang);
    let lawyer_email = contact_email(rng, &lawyer, true);
    fields.push(CaseField {
        name: "עורך דין:1".to_string(),
        value: lawyer.clone(),
    });
    // The address must be stored as case data, not only remembered in `planted`:
    // otherwise fixtures send from an address the case index has never seen and the
    // sender signal can never fire.
    fields.push(CaseField {
        name: "עורך דין:מייל:1".to_string(),
        value: lawyer_email.clone(),
    });
    planted.emails.push(lawyer_email);
    fields
}

fn litigation_fields(
    rng: &mut Rng,
    planted: &mut Planted,
    config: &CorpusConfig,
    plaintiff: &str,
    defendant: &str,
) -> Vec<CaseField> {
    let number = case_number(rng);
    planted.case_number = Some(number.clone());

    let mut fields = vec![
        CaseField {
            name: "מספר תיק".to_string(),
            value: number,
        },
        CaseField {
            name: "בית משפט".to_string(),
            value: rng.choose(COURTS).to_string(),
        },
        CaseField {
            name: "תובע:שם מלא:1".to_string(),
            value: plaintiff.to_string(),
        },
        CaseField {
            name: "נתבע:שם מלא:1".to_string(),
            value: defendant.to_string(),
        },
    ];

    // Litigation matters often carry a client ID too.
    if rng.chance(0.7) {
        let id = national_id(rng);
        fields.push(CaseField {
            name: "תובע:ת.ז:1".to_string(),
            value: id.clone(),
        });
        planted.national_ids.push(id);
    }

    let lawyer = person_name(rng, config.lang);
    let lawyer_email = contact_email(rng, &lawyer, true);
    fields.push(CaseField {
        name: "עורך דין:1".to_string(),
        value: lawyer,
    });
    fields.push(CaseField {
        name: "עורך דין:מייל:1".to_string(),
        value: lawyer_email.clone(),
    });
    planted.emails.push(lawyer_email);
    fields
}

fn document_paragraphs(
    rng: &mut Rng,
    title: &str,
    case: &CorpusCase,
    vocabulary: &[&'static str],
) -> Vec<String> {
    let mut paragraphs = vec![title.to_string(), case.subject.clone()];

    if let Some(cn) = &case.planted.case_number {
        paragraphs.push(format!("מספר תיק: {cn}"));
    }
    if let Some(lr) = &case.planted.land_registry {
        let parts: Vec<&str> = lr.split('/').collect();
        let mut line = format!("גוש {} חלקה {}", parts[0], parts[1]);
        if let Some(t) = parts.get(2) {
            line.push_str(&format!(" תת חלקה {t}"));
        }
        paragraphs.push(line);
    }
    for party in &case.planted.party_names {
        paragraphs.push(format!("צד להליך: {party}"));
    }

    // Body text built from the case's own vocabulary so `medium` emails share real
    // terminology with the documents.
    for _ in 0..rng.range(3, 6) {
        let picked = rng.sample(vocabulary, 3);
        let words: Vec<String> = picked.iter().map(|w| w.to_string()).collect();
        paragraphs.push(format!(
            "בהמשך לאמור, {} נדונו בין הצדדים בהתאם למוסכם.",
            words.join(", ")
        ));
    }
    paragraphs
}

pub fn build_cases(rng: &mut Rng, config: &CorpusConfig) -> Vec<CorpusCase> {
    let (lit_w, conv_w) = config.practice_mix;
    let total_w = lit_w + conv_w;

    let mut cases: Vec<CorpusCase> = Vec::with_capacity(config.cases);

    for i in 0..config.cases {
        // Deterministic proportional assignment rather than per-draw randomness, so the
        // realised split matches --practice-mix within one case instead of drifting.
        let practice = if ((i as u32 * total_w) / config.cases.max(1) as u32) < lit_w {
            Practice::Litigation
        } else {
            Practice::Conveyancing
        };
        let conveyancing = practice.is_conveyancing();

        let topic = rng.choose(topics_for(conveyancing));
        let subject_base = rng.choose(subjects_for(conveyancing));

        let mut planted = Planted {
            vocabulary: topic.vocabulary.iter().map(|s| s.to_string()).collect(),
            drift: topic.drift.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        };

        let party_a = person_name(rng, config.lang);
        let party_b = person_name(rng, config.lang);
        planted.party_names.push(party_a.clone());
        planted.party_names.push(party_b.clone());
        planted.phones.push(phone(rng));

        let fields = if conveyancing {
            conveyancing_fields(
                rng,
                &mut planted,
                config,
                &[party_a.clone()],
                &[party_b.clone()],
            )
        } else {
            litigation_fields(rng, &mut planted, config, &party_a, &party_b)
        };

        let client_email = contact_email(rng, &party_a, false);
        planted.emails.push(client_email.clone());

        let id = (i + 1) as i64;
        let subject = if conveyancing {
            format!("{subject_base} — {party_a}")
        } else {
            format!("{subject_base}: {party_a} נ' {party_b}")
        };

        let mut fields = fields;
        fields.push(CaseField {
            name: "מאת:מייל:1".to_string(),
            value: client_email,
        });

        let mut case = CorpusCase {
            id,
            practice,
            name: party_a.clone(),
            subject,
            folder: format!("cases/case_{id:03}"),
            topic: topic.label.to_string(),
            fields,
            documents: Vec::new(),
            planted,
            document_bodies: Vec::new(),
        };

        let titles = doc_titles_for(conveyancing);
        let doc_count = rng.range(3, 6) as usize;
        for title in rng.sample(titles, doc_count) {
            // .docx and .txt only: there is no PDF writer available (pdf_oxide is
            // read-only and no python helper exists), and hand-rolling a PDF with
            // embedded Hebrew fonts is out of scope for the generator.
            let ext = if rng.chance(0.7) { "docx" } else { "txt" };
            let file_name = format!("{}.{ext}", title.replace(' ', "_"));
            let paragraphs = document_paragraphs(rng, title, &case, topic.vocabulary);
            case.documents
                .push(format!("{}/{}", case.folder, file_name));
            case.document_bodies.push((file_name, paragraphs));
        }

        cases.push(case);
    }

    plant_shared_parties(rng, &mut cases);
    cases
}

/// Give some case pairs a party in common so the `adversarial` slice has genuine
/// ambiguity to exercise the matcher's ambiguity guard. Without this, "two cases
/// share a party" would never occur and the guard would go untested.
fn plant_shared_parties(rng: &mut Rng, cases: &mut [CorpusCase]) {
    if cases.len() < 2 {
        return;
    }
    let pair_count = (cases.len() / 4).max(1);
    let mut i = 0;
    while i + 1 < cases.len() && i / 2 < pair_count {
        let shared = cases[i].planted.party_names[0].clone();
        let partner = i + 1;
        if !cases[partner].planted.party_names.contains(&shared) {
            cases[partner].planted.party_names.push(shared.clone());
            let idx = cases[partner]
                .fields
                .iter()
                .filter(|f| f.name.contains("שם מלא"))
                .count()
                + 1;
            let role = if cases[partner].practice.is_conveyancing() {
                "מקבל"
            } else {
                "נתבע"
            };
            cases[partner].fields.push(CaseField {
                name: format!("{role}:שם מלא:{idx}"),
                value: shared,
            });
        }
        i += 2;
    }
    let _ = rng;
}

/// Pairs of case ids that share at least one party name.
/// Every party name held by more than one case, with **all** the cases holding it.
///
/// Groups, not pairs. Names come from a finite pool, so at 100 cases a name lands on four
/// or five cases routinely; enumerating pairs threw that away and let a fixture claim two
/// cases were the only legitimate answers when five were.
/// Ordered by name then case id so the corpus stays byte-reproducible.
pub fn shared_party_groups(cases: &[CorpusCase]) -> Vec<(String, Vec<i64>)> {
    let mut by_name: std::collections::BTreeMap<String, Vec<i64>> =
        std::collections::BTreeMap::new();
    for case in cases {
        for party in &case.planted.party_names {
            let ids = by_name.entry(party.clone()).or_default();
            if !ids.contains(&case.id) {
                ids.push(case.id);
            }
        }
    }
    by_name
        .into_iter()
        .filter(|(_, ids)| ids.len() > 1)
        .map(|(name, mut ids)| {
            ids.sort_unstable();
            (name, ids)
        })
        .collect()
}

/// Every case other than `case_id` that also lists `party`.
pub fn cases_sharing_party(cases: &[CorpusCase], party: &str, case_id: i64) -> Vec<i64> {
    let mut ids: Vec<i64> = cases
        .iter()
        .filter(|c| c.id != case_id && c.planted.party_names.iter().any(|p| p == party))
        .map(|c| c.id)
        .collect();
    ids.sort_unstable();
    ids
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email::corpus::test_config;

    fn build() -> Vec<CorpusCase> {
        let cfg = test_config();
        let mut rng = Rng::new(cfg.seed);
        build_cases(&mut rng, &cfg)
    }

    #[test]
    fn conveyancing_cases_never_carry_a_case_number() {
        for case in build().iter().filter(|c| c.practice.is_conveyancing()) {
            assert!(
                case.planted.case_number.is_none(),
                "case {} leaked a case number into a conveyancing matter",
                case.id
            );
            assert!(
                case.planted.land_registry.is_some(),
                "conveyancing case {} has no land-registry key",
                case.id
            );
            assert!(!case.fields.iter().any(|f| f.name.contains("מספר תיק")));
        }
    }

    #[test]
    fn litigation_cases_carry_a_case_number() {
        for case in build().iter().filter(|c| !c.practice.is_conveyancing()) {
            assert!(case.planted.case_number.is_some(), "case {}", case.id);
        }
    }

    #[test]
    fn fields_use_compound_role_field_index_naming() {
        let cases = build();
        let has_compound = cases
            .iter()
            .flat_map(|c| &c.fields)
            .any(|f| f.name.matches(':').count() >= 2);
        assert!(has_compound, "expected role:field:index style field names");
    }

    #[test]
    fn national_ids_pass_the_check_digit() {
        for case in build() {
            for id in &case.planted.national_ids {
                assert_eq!(id.len(), 9, "id {id} wrong length");
                let digits: Vec<u32> = id.chars().map(|c| c.to_digit(10).unwrap()).collect();
                let mut sum = 0;
                for (i, d) in digits.iter().take(8).enumerate() {
                    let mut v = d * if i % 2 == 0 { 1 } else { 2 };
                    if v > 9 {
                        v -= 9;
                    }
                    sum += v;
                }
                assert_eq!((10 - (sum % 10)) % 10, digits[8], "bad check digit in {id}");
            }
        }
    }

    #[test]
    fn practice_mix_is_respected() {
        let cases = build();
        let conv = cases.iter().filter(|c| c.practice.is_conveyancing()).count();
        let ratio = conv as f64 / cases.len() as f64;
        assert!((ratio - 0.5).abs() <= 0.03, "conveyancing ratio {ratio}");
    }

    #[test]
    fn every_case_has_documents() {
        for case in build() {
            assert!(!case.documents.is_empty(), "case {} has no documents", case.id);
            assert_eq!(case.documents.len(), case.document_bodies.len());
        }
    }

    #[test]
    fn some_cases_share_a_party_for_the_adversarial_slice() {
        let groups = shared_party_groups(&build());
        assert!(!groups.is_empty());
        assert!(groups.iter().all(|(_, ids)| ids.len() >= 2));
    }

    /// A group must list *every* case holding the name, not the first two.
    ///
    /// The pools are finite, so at 100 cases a name lands on four or five cases. Recording
    /// a pair made the corpus assert a single right answer where several were equally
    /// right, and the matcher was charged with a mislink for picking an unrecorded one.
    #[test]
    fn a_group_lists_every_case_holding_the_name() {
        let cases = build();
        for (name, ids) in shared_party_groups(&cases) {
            let actual: Vec<i64> = cases
                .iter()
                .filter(|c| c.planted.party_names.contains(&name))
                .map(|c| c.id)
                .collect();
            assert_eq!(ids, actual, "group for {name:?} is incomplete");
        }
    }

    #[test]
    fn cases_sharing_a_party_excludes_the_case_itself() {
        let cases = build();
        let (name, ids) = shared_party_groups(&cases).remove(0);
        let others = cases_sharing_party(&cases, &name, ids[0]);
        assert!(!others.contains(&ids[0]));
        assert_eq!(others.len(), ids.len() - 1);
    }
}
