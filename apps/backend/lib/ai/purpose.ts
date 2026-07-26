// Must match ai_requests.purpose's enum in apps/backend/database/schema.ts.
export const VALID_PURPOSES = [
  "chat",
  "email_classification",
  "field_extraction",
  "doc_indexing",
  "query_analysis",
  "voice_transcription",
] as const;

export type Purpose = (typeof VALID_PURPOSES)[number];

/**
 * Resolves an untrusted client-supplied purpose string, falling back to
 * `fallback` when it's missing or not a recognized value. /complete
 * defaults to "chat" (its historical catch-all); /transcribe defaults to
 * "voice_transcription", since transcription is that route's only reason
 * to exist.
 */
export function resolvePurpose(purpose: string | undefined, fallback: Purpose = "chat"): Purpose {
  return (VALID_PURPOSES as readonly string[]).includes(purpose ?? "") ? (purpose as Purpose) : fallback;
}
