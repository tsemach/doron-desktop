use serde::Deserialize;

/// One line of the NDJSON envelope the backend's /api/v1/ai/complete route
/// streams back (see apps/backend/app/api/v1/ai/complete/route.ts and
/// docs/ai-online-proxy/ai_online_proxy_architecture.md §6). `rename_all =
/// "camelCase"` covers both the variant tag values (Delta -> "delta", etc.)
/// and the field names within each variant (finish_reason -> "finishReason"),
/// matching the JS object shapes route.ts actually enqueues.
// `rename_all` on the enum itself only renames the variant tags (Delta ->
// "delta", etc.) -- it does NOT cascade into the fields of struct variants
// (confirmed by a failing test, not assumed: serde reported "missing field
// `finish_reason`" against a payload that had "finishReason"). Each
// variant needs its own `rename_all` for its fields to pick up the same
// casing.
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    #[serde(rename_all = "camelCase")]
    Delta {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Done {
        finish_reason: String,
        usage: Usage,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        code: String,
        message: String,
        retryable: bool,
        partial: bool,
        retry_after_seconds: Option<u32>,
    },
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

/// Accumulates bytes from a chunked HTTP response body and yields one
/// parsed StreamEvent per complete NDJSON line. Real TCP chunks (fed via
/// `.push()` from a `response.chunk()` loop, see llm_provider_backend_online.rs)
/// won't respect line boundaries -- a line can arrive split across two or
/// more chunks -- so any trailing partial line is retained across calls
/// rather than parsed prematurely.
#[derive(Default)]
pub struct LineBuffer {
    buf: Vec<u8>,
}

impl LineBuffer {
    /// Appends `bytes`, splits out every complete (`\n`-terminated) line
    /// found so far, and returns one `Result` per complete line -- `Err`
    /// for a line that isn't valid UTF-8 or doesn't parse as a StreamEvent,
    /// without losing track of the buffer for subsequent lines (a
    /// malformed line doesn't poison anything after it).
    pub fn push(&mut self, bytes: &[u8]) -> Vec<Result<StreamEvent, String>> {
        self.buf.extend_from_slice(bytes);
        let mut results = Vec::new();

        while let Some(newline_pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=newline_pos).collect();
            let line = strip_line_ending(&line);

            if line.is_empty() {
                continue;
            }

            let parsed = match std::str::from_utf8(line) {
                Ok(s) => serde_json::from_str::<StreamEvent>(s).map_err(|e| e.to_string()),
                Err(e) => Err(e.to_string()),
            };
            results.push(parsed);
        }

        results
    }
}

/// Drops the trailing `\n` (already known present -- callers slice up to
/// and including it) and, if present, a preceding `\r` -- tolerates a
/// CRLF-terminated line even though the backend only ever sends bare `\n`.
fn strip_line_ending(line: &[u8]) -> &[u8] {
    let line = &line[..line.len() - 1];
    match line.last() {
        Some(b'\r') => &line[..line.len() - 1],
        _ => line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_one_complete_line_in_one_push() {
        let mut buf = LineBuffer::default();
        let results = buf.push(b"{\"type\":\"delta\",\"text\":\"Hello\"}\n");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0], Ok(StreamEvent::Delta { text: "Hello".to_string() }));
    }

    #[test]
    fn reassembles_a_line_split_across_two_pushes() {
        // Simulates a real TCP chunk boundary landing mid-line -- the
        // whole reason LineBuffer exists rather than parsing each chunk
        // independently.
        let mut buf = LineBuffer::default();
        let first = buf.push(b"{\"type\":\"delta\",\"te");
        assert!(first.is_empty(), "no complete line yet -- nothing should be yielded");

        let second = buf.push(b"xt\":\"Hello\"}\n");
        assert_eq!(second.len(), 1);
        assert_eq!(second[0], Ok(StreamEvent::Delta { text: "Hello".to_string() }));
    }

    #[test]
    fn parses_multiple_lines_in_one_push() {
        let mut buf = LineBuffer::default();
        let results = buf.push(
            b"{\"type\":\"delta\",\"text\":\"Hello\"}\n{\"type\":\"delta\",\"text\":\", world!\"}\n",
        );

        assert_eq!(results.len(), 2);
        assert_eq!(results[0], Ok(StreamEvent::Delta { text: "Hello".to_string() }));
        assert_eq!(results[1], Ok(StreamEvent::Delta { text: ", world!".to_string() }));
    }

    #[test]
    fn parses_a_delta_followed_by_a_partial_error() {
        let mut buf = LineBuffer::default();
        let results = buf.push(
            b"{\"type\":\"delta\",\"text\":\"Partial\"}\n\
              {\"type\":\"error\",\"code\":\"provider_error\",\"message\":\"boom\",\"retryable\":true,\"partial\":true,\"retryAfterSeconds\":null}\n",
        );

        assert_eq!(results.len(), 2);
        assert_eq!(results[0], Ok(StreamEvent::Delta { text: "Partial".to_string() }));
        assert_eq!(
            results[1],
            Ok(StreamEvent::Error {
                code: "provider_error".to_string(),
                message: "boom".to_string(),
                retryable: true,
                partial: true,
                retry_after_seconds: None,
            })
        );
    }

    #[test]
    fn parses_done_with_nested_usage() {
        let mut buf = LineBuffer::default();
        let results =
            buf.push(b"{\"type\":\"done\",\"finishReason\":\"stop\",\"usage\":{\"inputTokens\":10,\"outputTokens\":5}}\n");

        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0],
            Ok(StreamEvent::Done {
                finish_reason: "stop".to_string(),
                usage: Usage { input_tokens: Some(10), output_tokens: Some(5) },
            })
        );
    }

    #[test]
    fn malformed_json_on_one_line_does_not_poison_subsequent_lines() {
        let mut buf = LineBuffer::default();
        let results = buf.push(b"not valid json\n{\"type\":\"delta\",\"text\":\"still works\"}\n");

        assert_eq!(results.len(), 2);
        assert!(results[0].is_err());
        assert_eq!(results[1], Ok(StreamEvent::Delta { text: "still works".to_string() }));
    }

    #[test]
    fn retains_a_trailing_partial_line_with_no_newline_yet() {
        let mut buf = LineBuffer::default();
        let results = buf.push(b"{\"type\":\"delta\",\"text\":\"no newline yet\"}");
        assert!(results.is_empty());
    }
}
