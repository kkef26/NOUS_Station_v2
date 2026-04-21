/**
 * chain-retry.ts — Fallback chain retry logic for LLM calls
 * Purpose: On 429/5xx/auth failure, retry with next account in fallback chain
 * Invocation: streamWithChainRetry({ primary, fallbackChain, providerName, streamInput, onFallback })
 * Inputs: primary account + fallback chain + LLM stream input
 * Outputs: AsyncIterable<Chunk> (from whichever account succeeds)
 * Error modes: chain_exhausted (all accounts fail), upstream_error, rate_limited, credential_expired
 * Blast radius: wraps every LLM call site
 * Version: 1.0.0
 */
import { getServiceClient } from "@/lib/supabase/server";
import { getProvider, type Chunk, type ProviderName } from "@/lib/llm";
import { resolveChainCredential, type Account } from "./resolve";
import { mark429 } from "./rate-limit";

type StreamInput = {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  system?: string;
  model: string;
  maxTokens?: number;
};

type ChainRetryOpts = {
  primary: Account;
  primaryCredential: string;
  fallbackChain: Account[];
  streamInput: StreamInput;
  originalProvider: string;
};

/** Determine the ProviderName for getProvider() from an account */
function accountProviderName(account: Account): ProviderName {
  return account.provider as ProviderName;
}

/**
 * Stream with chain-retry: tries primary, then each fallback in order.
 * On 429/5xx/auth errors, logs a fallback_fire event and tries next.
 */
export async function* streamWithChainRetry(opts: ChainRetryOpts): AsyncIterable<Chunk> {
  const { primary, primaryCredential, fallbackChain, streamInput, originalProvider } = opts;
  const db = getServiceClient();

  // Build the full chain: primary + fallbacks
  const chain = [
    { account: primary, credential: primaryCredential },
    ...fallbackChain.map((a) => ({
      account: a,
      credential: resolveChainCredential(a),
    })),
  ];

  for (let i = 0; i < chain.length; i++) {
    const { account, credential } = chain[i];
    const providerName = accountProviderName(account);
    const isLast = i === chain.length - 1;

    // Skip station_proxy if we can't route to it
    if (providerName === "station_proxy") {
      // station_proxy is handled separately in the chat route
      // For chain retry in non-chat contexts, skip it
      if (!isLast) continue;
    }

    try {
      const llm = getProvider(providerName, credential);
      let hasError = false;
      let errorMessage = "";
      const chunks: Chunk[] = [];

      for await (const chunk of llm.stream(streamInput)) {
        if (chunk.type === "error") {
          hasError = true;
          errorMessage = chunk.data.message;

          // Detect error type and handle accordingly
          const is429 = errorMessage.includes("429") || errorMessage.includes("rate limit");
          const is5xx = errorMessage.includes("500") || errorMessage.includes("502") ||
                        errorMessage.includes("503") || errorMessage.includes("504");
          const isAuth = errorMessage.includes("401") || errorMessage.includes("403") ||
                         errorMessage.includes("authentication") || errorMessage.includes("unauthorized");

          let reason = "upstream_error";
          if (is429) {
            reason = "rate_limited";
            // Create a mock Response for mark429
            const mockHeaders = new Headers();
            const mockResp = new Response(null, { status: 429, headers: mockHeaders });
            await mark429(account.id, providerName, mockResp);
          } else if (isAuth) {
            reason = "credential_expired";
            await db.from("accounts").update({
              status: "expired",
              status_source: "runtime_error",
              status_reason: errorMessage.slice(0, 200),
            }).eq("id", account.id);
          } else if (is5xx) {
            reason = "upstream_error";
          }

          // Log fallback_fire if we're going to retry
          if (!isLast) {
            const nextAccount = chain[i + 1].account;
            await db.from("account_usage_events").insert({
              account_id: account.id,
              event_type: "fallback_fire",
              detail: {
                from_account_id: account.id,
                to_account_id: nextAccount.id,
                reason,
                original_provider: originalProvider,
                error: errorMessage.slice(0, 200),
              },
            });
            break; // Break inner loop to try next in chain
          } else {
            // Last in chain — yield the error
            yield chunk;
            return;
          }
        } else {
          chunks.push(chunk);
          yield chunk;
        }
      }

      // If we got through without error, update last_known_good_at and return
      if (!hasError) {
        await db.from("accounts").update({
          last_known_good_at: new Date().toISOString(),
        }).eq("id", account.id);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[chain-retry] Error with account ${account.id} (${providerName}):`, msg);

      if (!isLast) {
        const nextAccount = chain[i + 1].account;
        await db.from("account_usage_events").insert({
          account_id: account.id,
          event_type: "fallback_fire",
          detail: {
            from_account_id: account.id,
            to_account_id: nextAccount.id,
            reason: "upstream_error",
            original_provider: originalProvider,
            error: msg.slice(0, 200),
          },
        });
        continue;
      } else {
        yield { type: "error", data: { message: msg, retryable: false } };
        return;
      }
    }
  }

  // Should not reach here, but just in case
  yield {
    type: "error",
    data: { message: `All accounts exhausted for ${originalProvider}`, retryable: false },
  };
}
