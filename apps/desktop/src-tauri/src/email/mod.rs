pub mod case_matcher;
mod emails_attachments;
mod normalize;
mod types;
mod emails_settings;
mod emails_ops;
mod emails_ingestion;
mod emails_classify;
mod emails_classify_deterministic;
mod emails_classify_llm;
mod emails_case_api;
mod emails_orchestrate;
mod emails_alerts;

// Re-export public types and commands so lib.rs and other crates can use them
// Re-exported so the case-side identifier miner can run the *same* extraction over
// case fields that the pipeline runs over email text — one regex set, both sides.
pub use emails_classify_deterministic::{extract_email_signals, parse_sender};
pub use emails_attachments::*;
pub use normalize::*;
pub use types::*;
pub use emails_settings::*;
pub use emails_ops::*;
pub use emails_ingestion::*;
pub use emails_classify::*;
pub use emails_case_api::*;
pub use emails_orchestrate::*;
pub use emails_alerts::*;
