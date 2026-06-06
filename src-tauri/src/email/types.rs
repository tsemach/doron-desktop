use serde::{Deserialize, Serialize};

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EmailConfig {
    pub imap_server: String,
    pub imap_port: u16,
    pub username: String,
    pub password_enc: String,
    pub provider: String,
    pub api_key_enc: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PendingAlert {
    pub id: i64,
    pub message_id: String,
    pub sender: String,
    pub subject: String,
    pub body_snippet: String,
    pub body_text: Option<String>,
    pub received_at: String,
    pub suggested_case_id: Option<i64>,
    pub confidence: f64,
    pub reason: String,
    pub attachments_json: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CaseEmail {
    pub id: i64,
    pub case_id: i64,
    pub message_id: String,
    pub sender: String,
    pub recipient: String,
    pub subject: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub direction: String,
    pub received_at: String,
    pub attachments_json: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AttachmentMetadata {
    pub name: String,
    pub staged_path: String,
    pub size_kb: i64,
}

pub struct AttachmentData {
    pub filename: String,
    pub bytes: Vec<u8>,
    pub size_kb: i64,
}

#[derive(Deserialize)]
pub struct MatchResult {
    pub suggested_case_id: Option<i64>,
    pub confidence: f64,
    pub reason: String,
}

// ── Subject Blocklist Keywords ───────────────────────────────────────────────

pub const BLOCKED_SUBJECT_KEYWORDS: &[&str] = &[
    "דף פירוט",
    "חיוב חודשי",
    "פירוט החיובים",
    "חשבונית מס",
    "קבלה",
    "חשבונית/קבלה",
    "פירוט חיוב",
    "אישור תשלום",
    "הוראת קבע",
    "אישור פעולה",
    "תנועה חדשה",
    "הודעת תשלום",
    "החשבונית שלך",
    "הקבלה שלך",
    "newsletter",
    "digest",
    "weekly summary",
    "monthly summary",
    "your account",
    "statement of account",
    "reset password",
    "otp",
    "one-time password",
    "verification code",
    "קוד אימות",
];
