mod types;
mod emails_settings;
mod emails_ops;
mod emails_ingestion;
mod emails_ai;
mod emails_alerts;

// Re-export public types and commands so lib.rs and other crates can use them
pub use types::*;
pub use emails_settings::*;
pub use emails_ops::*;
pub use emails_ingestion::*;
pub use emails_alerts::*;
