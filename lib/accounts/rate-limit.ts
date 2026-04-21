/**
 * rate-limit.ts — Provider rate-limit header parsing and 429 handling
 * Purpose: Parse rate-limit headers from LLM responses, update account status on 429
 * Invocation: parseRateLimitHeaders(provider, headers), recordRateLimitResponse(id, provider, resp), mark429(id, resp)
 * Inputs: provider name + Response object or Headers
 * Outputs: parsed rate-limit info or void (side-effect: DB update)
 * Error modes: DB write failure (logged, not thrown — rate-limit tracking is best-effort)
 * Blast radius: writes to nous.accounts columns rate_limit_remaining, rate_limited_until, last_known_good_at
 * Version: 1.0.0
 */
import { getServiceClient } from "@/lib/supabase/server";

export type RateLimitInfo = {
  tokens_remaining?: number;
  requests_remaining?: number;
  reset_at?: string;
};

/** Parse rate-limit headers from a provider response. Provider-specific logic. */
export function parseRateLimitHeaders(provider: string, headers: Headers): RateLimitInfo {
  const info: RateLimitInfo = {};

  switch (provider) {
    case "anthropic": {
      const tokensRemaining = headers.get("anthropic-ratelimit-tokens-remaining");
      const requestsRemaining = headers.get("anthropic-ratelimit-requests-remaining");
      const tokensReset = headers.get("anthropic-ratelimit-tokens-reset");
      if (tokensRemaining) info.tokens_remaining = parseInt(tokensRemaining, 10);
      if (requestsRemaining) info.requests_remaining = parseInt(requestsRemaining, 10);
      if (tokensReset) info.reset_at = tokensReset;
      break;
    }
    case "openai":
    case "xai": {
      const tokensRemaining = headers.get("x-ratelimit-remaining-tokens");
      const requestsRemaining = headers.get("x-ratelimit-remaining-requests");
      const resetTokens = headers.get("x-ratelimit-reset-tokens");
      if (tokensRemaining) info.tokens_remaining = parseInt(tokensRemaining, 10);
      if (requestsRemaining) info.requests_remaining = parseInt(requestsRemaining, 10);
      if (resetTokens) info.reset_at = resetTokens;
      break;
    }
    case "google": {
      // Google uses 429 body retryInfo, no header-based quota. Best-effort.
      break;
    }
    default:
      break;
  }

  return info;
}

/** Record rate-limit headers on a successful (non-429) response. Best-effort DB write. */
export async function recordRateLimitResponse(
  account_id: string,
  provider: string,
  headers: Headers
): Promise<void> {
  const info = parseRateLimitHeaders(provider, headers);
  if (!info.tokens_remaining && !info.requests_remaining) return;

  const db = getServiceClient();
  const now = new Date().toISOString();

  await db
    .from("accounts")
    .update({
      rate_limit_remaining: info,
      last_known_good_at: now,
    })
    .eq("id", account_id)
    .then(({ error }) => {
      if (error) console.error("[rate-limit] recordRateLimitResponse DB error:", error.message);
    });
}

/** Parse Retry-After from a 429 response. Returns seconds to wait. */
function parseRetryAfter(provider: string, response: Response): number {
  // Standard Retry-After header
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds;
    // RFC date format
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
    }
  }

  // Provider-specific reset headers
  if (provider === "anthropic") {
    const reset = response.headers.get("anthropic-ratelimit-tokens-reset");
    if (reset) {
      const resetDate = new Date(reset);
      if (!isNaN(resetDate.getTime())) {
        return Math.max(1, Math.ceil((resetDate.getTime() - Date.now()) / 1000));
      }
    }
  }

  if (provider === "openai" || provider === "xai") {
    const reset = response.headers.get("x-ratelimit-reset-tokens");
    if (reset) {
      // OpenAI uses duration strings like "6m0s" or ISO dates
      const match = reset.match(/(\d+)m/);
      if (match) return parseInt(match[1], 10) * 60;
      const resetDate = new Date(reset);
      if (!isNaN(resetDate.getTime())) {
        return Math.max(1, Math.ceil((resetDate.getTime() - Date.now()) / 1000));
      }
    }
  }

  // Consumer subs (no quota headers) — safe guess 300s
  return 300;
}

/** Mark an account as rate-limited after receiving a 429. Updates DB, returns retry_after_seconds. */
export async function mark429(
  account_id: string,
  provider: string,
  response: Response
): Promise<{ retry_after_seconds: number }> {
  const retryAfterSeconds = parseRetryAfter(provider, response);
  const rateLimitedUntil = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();

  const db = getServiceClient();

  const rateLimitInfo = parseRateLimitHeaders(provider, response.headers);

  await db
    .from("accounts")
    .update({
      status: "rate_limited",
      status_source: "runtime_error",
      status_reason: `429 rate limited — retry after ${retryAfterSeconds}s`,
      rate_limited_until: rateLimitedUntil,
      rate_limit_remaining: Object.keys(rateLimitInfo).length > 0 ? rateLimitInfo : { exhausted: true },
    })
    .eq("id", account_id)
    .then(({ error }) => {
      if (error) console.error("[rate-limit] mark429 DB error:", error.message);
    });

  return { retry_after_seconds: retryAfterSeconds };
}
