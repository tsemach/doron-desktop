//! Deterministic email→case matcher.
//!
//! P2 lands the configuration only; the tiers and `match_email_core` arrive in P4/P5.
//! `resolve_case_api` still returns the stub until then, so runtime behaviour is
//! unchanged by this module's presence.

pub mod config;

pub use config::{EmailPipelineMode, MatcherConfig, SignalWeights};
