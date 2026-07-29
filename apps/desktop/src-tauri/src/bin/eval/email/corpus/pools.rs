//! Static content pools for corpus generation (Hebrew-first, English variants).
//!
//! Field names follow the compound `role:field:index` convention observed on a real
//! profile (P0 / AMI-110) — e.g. `מאת:ת.ז:2`, `גוש ספר:1` — so the P2 identifier miner
//! is exercised against the format it will actually meet in production.

pub const FAMILY_NAMES_HE: &[&str] = &[
    "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "דהן", "אזולאי", "גבאי", "שלום",
    "אוחיון", "חדד", "מלכה", "נחום", "סבן", "אשכנזי", "בן דוד", "הררי", "יוסף", "רוזן",
];

pub const GIVEN_NAMES_HE: &[&str] = &[
    "דוד", "משה", "יוסף", "אברהם", "שרה", "רחל", "מרים", "יעקב", "דניאל", "נועה",
    "תמר", "איתן", "רונית", "אורי", "יעל", "עמית", "שירה", "גיל", "מיכל", "אסף",
];

pub const FAMILY_NAMES_EN: &[&str] = &[
    "Cohen", "Levy", "Mizrachi", "Peretz", "Biton", "Abraham", "Dahan", "Azoulay",
];

pub const GIVEN_NAMES_EN: &[&str] = &[
    "David", "Moshe", "Joseph", "Sarah", "Rachel", "Daniel", "Noa", "Ethan",
];

pub const CITIES_HE: &[&str] = &[
    "תל אביב", "ירושלים", "חיפה", "באר שבע", "אילת", "נתניה", "רעננה", "הרצליה",
    "אשדוד", "פתח תקווה", "רמת גן", "כפר סבא",
];

pub const REGISTRY_BUREAUS: &[&str] = &[
    "תל אביב", "חיפה", "ירושלים", "באר שבע", "נתניה", "פתח תקווה",
];

pub const COURTS: &[&str] = &[
    "בית משפט השלום בתל אביב",
    "בית משפט השלום בחיפה",
    "בית המשפט המחוזי בירושלים",
    "בית המשפט המחוזי מרכז",
    "בית משפט השלום בבאר שבע",
];

pub const LAW_FIRM_DOMAINS: &[&str] = &[
    "lawfirm.co.il", "adv-office.co.il", "law-partners.co.il", "mishpat.co.il",
];

pub const NEUTRAL_DOMAINS: &[&str] = &["gmail.com", "walla.co.il", "outlook.com"];

/// A case topic: drives document content, and gives `medium` difficulty emails real
/// vocabulary overlap with the case's documents while `hard` deliberately drifts away.
pub struct Topic {
    pub label: &'static str,
    /// Words that appear in the case's documents — shared vocabulary.
    pub vocabulary: &'static [&'static str],
    /// Wording a client might use instead; deliberately absent from the documents.
    pub drift: &'static [&'static str],
}

pub const CONVEYANCING_TOPICS: &[Topic] = &[
    Topic {
        label: "דירה בבית משותף",
        vocabulary: &["דירה", "בית משותף", "ועד הבית", "חניה", "מחסן", "רכוש משותף"],
        drift: &["הנכס שדיברנו עליו", "המקום החדש", "הבית"],
    },
    Topic {
        label: "מגרש לבנייה",
        vocabulary: &["מגרש", "היתר בנייה", "תב\"ע", "ועדה מקומית", "שטח"],
        drift: &["הקרקע", "מה שרכשנו", "הפרויקט"],
    },
    Topic {
        label: "העברה ללא תמורה",
        vocabulary: &["מתנה", "ללא תמורה", "קרוב משפחה", "פטור ממס"],
        drift: &["ההעברה במשפחה", "מה שסיכמנו עם ההורים"],
    },
    Topic {
        label: "משכנתא ורישום",
        vocabulary: &["משכנתא", "בנק", "שעבוד", "אישור זכויות", "רישום"],
        drift: &["ההלוואה", "העניין מול הסניף"],
    },
];

pub const LITIGATION_TOPICS: &[Topic] = &[
    Topic {
        label: "תאונת דרכים",
        vocabulary: &["תאונה", "נזק", "ביטוח", "רכב", "חבלה", "פיצויים"],
        drift: &["מה שקרה בכביש", "האירוע", "הפגיעה"],
    },
    Topic {
        label: "תביעה כספית",
        vocabulary: &["חוב", "שטר חוב", "הוצאה לפועל", "ריבית", "התראה"],
        drift: &["הכסף שחייבים לי", "הסכום הפתוח"],
    },
    Topic {
        label: "סכסוך שכנים",
        vocabulary: &["מטרד", "רעש", "גבול", "צו מניעה", "שכן"],
        drift: &["הבעיה עם הדיירים", "הסיפור בבניין"],
    },
    Topic {
        label: "יחסי עבודה",
        vocabulary: &["פיטורים", "שימוע", "פיצויי פיטורים", "הודעה מוקדמת", "מעסיק"],
        drift: &["מה שקרה בעבודה", "העניין עם המנהל"],
    },
];

pub const CONVEYANCING_SUBJECTS: &[&str] = &[
    "מכירת דירה", "העברת זכויות ללא תמורה", "רישום משכנתא", "מכר מגרש",
    "חלוקת עיזבון", "רישום בית משותף",
];

pub const LITIGATION_SUBJECTS: &[&str] = &[
    "תביעת נזיקין", "תביעה כספית", "תביעת פינוי", "תביעת לשון הרע",
    "ערעור מנהלי", "תביעה בבית הדין לעבודה",
];

pub const CONVEYANCING_DOC_TITLES: &[&str] = &[
    "הסכם מכר", "שטר מכר", "נסח רישום", "אישור מיסים", "ייפוי כוח נוטריוני",
    "אישור זכויות",
];

pub const LITIGATION_DOC_TITLES: &[&str] = &[
    "כתב תביעה", "כתב הגנה", "פרוטוקול דיון", "תצהיר עדות ראשית",
    "בקשה לצו מניעה", "כתב ויתור",
];

/// Subjects for the `unrelated` slice — marketing, OTP, billing, newsletters.
pub const UNRELATED_SUBJECTS: &[&str] = &[
    "מבצע מיוחד לחג — 50% הנחה",
    "קוד האימות שלך הוא 483921",
    "החשבונית החודשית שלך מוכנה",
    "ניוזלטר שבועי — חדשות הנדל\"ן",
    "הזמנה לוובינר: שיווק דיגיטלי לעסקים",
    "Your subscription is about to renew",
    "Weekly digest: 5 articles you missed",
    "Password reset requested",
];

pub const UNRELATED_SENDERS: &[&str] = &[
    "noreply@newsletter.co.il",
    "no-reply@verification-service.com",
    "billing@saas-vendor.com",
    "marketing@promo-deals.co.il",
    "digest@medium.com",
];

pub const UNRELATED_BODIES: &[&str] = &[
    "לחצו כאן כדי להסיר את עצמכם מרשימת התפוצה.",
    "This is an automated message. Please do not reply.",
    "המבצע בתוקף עד סוף החודש. ט.ל.ח.",
    "If you did not request this, you can safely ignore this email.",
];

pub fn topics_for(conveyancing: bool) -> &'static [Topic] {
    if conveyancing {
        CONVEYANCING_TOPICS
    } else {
        LITIGATION_TOPICS
    }
}

pub fn subjects_for(conveyancing: bool) -> &'static [&'static str] {
    if conveyancing {
        CONVEYANCING_SUBJECTS
    } else {
        LITIGATION_SUBJECTS
    }
}

pub fn doc_titles_for(conveyancing: bool) -> &'static [&'static str] {
    if conveyancing {
        CONVEYANCING_DOC_TITLES
    } else {
        LITIGATION_DOC_TITLES
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A `hard` fixture is built from a topic's `drift` wording and must not hand the
    /// matcher any term its documents already use. Overlap here silently turns the
    /// hardest slice into a medium one, so it is guarded at the data level.
    #[test]
    fn drift_never_contains_topic_vocabulary() {
        for topics in [CONVEYANCING_TOPICS, LITIGATION_TOPICS] {
            for topic in topics {
                for phrase in topic.drift {
                    for word in topic.vocabulary {
                        assert!(
                            !phrase.contains(word),
                            "topic {:?}: drift {phrase:?} contains vocabulary {word:?}",
                            topic.label
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn every_topic_has_both_pools_populated() {
        for topics in [CONVEYANCING_TOPICS, LITIGATION_TOPICS] {
            for topic in topics {
                assert!(topic.vocabulary.len() >= 3, "topic {:?}", topic.label);
                assert!(topic.drift.len() >= 2, "topic {:?}", topic.label);
            }
        }
    }
}
