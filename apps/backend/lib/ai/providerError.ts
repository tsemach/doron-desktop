interface ApiErrorLike {
  statusCode?: number;
  isRetryable?: boolean;
  responseHeaders?: Record<string, string>;
}

function isApiErrorLike(error: unknown): error is ApiErrorLike {
  return typeof error === "object" && error !== null && ("statusCode" in error || "isRetryable" in error);
}

// Static, support-friendly text per error code -- never the raw
// provider/Gateway error string. That string can carry operational details
// (e.g. "AI Gateway requires a valid credit card on file...") that are
// Amicus's problem to fix, not something to show a paying end user; the
// raw error is logged server-side by the caller instead.
const GENERIC_ERROR_MESSAGES: Record<"rate_limited" | "provider_error", string> = {
  rate_limited: "The AI service is temporarily busy. Please try again shortly.",
  provider_error: "The AI request failed. Please try again, or contact support if this keeps happening.",
};

export interface MappedProviderError {
  code: "rate_limited" | "provider_error";
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

/**
 * Maps an AI SDK/Gateway error into the support-facing shape shared by
 * every backend-proxied AI route. Shared between /complete (which enqueues
 * this into its NDJSON stream) and /transcribe (which returns it as a
 * plain JSON error response) -- extracted so both stay in sync rather than
 * duplicating the statusCode/retryable/retry-after derivation.
 */
export function mapProviderError(error: unknown): MappedProviderError {
  // Some AI SDK error classes (e.g. @ai-sdk/gateway's
  // GatewayInternalServerError, thrown for a 403 "credit card required on
  // the Gateway account" failure) aren't branded as an APICallError --
  // APICallError.isInstance(error) is false for them -- but they do carry
  // the same statusCode/isRetryable/responseHeaders fields as real own
  // properties, so duck-type instead of brand-checking.
  const apiError = isApiErrorLike(error) ? error : undefined;

  const statusCode = apiError?.statusCode;
  const code = statusCode === 429 ? "rate_limited" : "provider_error";
  // Default to retryable when the error shape is unrecognized -- a
  // transient/unknown failure should offer retry, not silently assume
  // it's permanent.
  const retryable = apiError ? apiError.isRetryable !== false : true;
  const retryAfterHeader = apiError?.responseHeaders?.["retry-after"];
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;

  return {
    code,
    message: GENERIC_ERROR_MESSAGES[code],
    retryable,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}
