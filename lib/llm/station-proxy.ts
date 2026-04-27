import type { LLMProvider, Chunk } from "./types";

/**
 * StationProxyProvider — routes LLM calls through the Station Proxy at EC2.
 * The proxy handles all providers (Anthropic via OAuth, OpenAI/Google/xAI/DeepSeek via API keys).
 * Credential here is the NOUS API key used for x-api-key auth on the proxy.
 */
export class StationProxyProvider implements LLMProvider {
  private apiKey: string;
  private proxyUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.proxyUrl = process.env.STATION_PROXY_URL || "http://54.196.89.164:8095";
  }

  async *stream(input: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    system?: string;
    model: string;
    maxTokens?: number;
    provider?: string;
    provider_model?: string;
    personality?: string;
  }): AsyncIterable<Chunk> {
    const start = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;

    // Map the provider/model for the proxy
    // The proxy expects: provider (anthropic|openai|google|xai|deepseek), provider_model, messages, system
    const proxyProvider = input.provider || "anthropic";
    const proxyModel = input.provider_model || input.model;

    try {
      const resp = await fetch(`${this.proxyUrl}/v1/inference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          messages: input.messages,
          system: input.system || "",
          provider: proxyProvider,
          provider_model: proxyModel,
          model: proxyModel,
          personality: input.personality || "default",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "proxy error");
        yield {
          type: "error",
          data: {
            message: `Station proxy ${resp.status}: ${errText}`,
            retryable: resp.status >= 500 || resp.status === 429,
          },
        };
        return;
      }

      if (!resp.body) {
        yield { type: "error", data: { message: "No response body from proxy", retryable: false } };
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              // The proxy emits SSE frames:
              //   event: token  data: {"token": "..."} or just the string
              //   event: done   data: {"tokens_in":N, "tokens_out":N}
              if (parsed.token !== undefined) {
                yield { type: "token", data: parsed.token };
              } else if (parsed.tokens_in !== undefined) {
                tokensIn = parsed.tokens_in || 0;
                tokensOut = parsed.tokens_out || 0;
              } else if (parsed.error) {
                yield { type: "error", data: { message: parsed.error, retryable: false } };
                return;
              }
            } catch {
              // Raw string token
              if (data && data !== "[DONE]") {
                yield { type: "token", data };
              }
            }
          } else if (line.startsWith("event: ")) {
            // Track event type for next data line — already handled inline
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        if (buffer.startsWith("data: ")) {
          const data = buffer.slice(6).trim();
          if (data && data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              if (parsed.token !== undefined) {
                yield { type: "token", data: parsed.token };
              } else if (parsed.tokens_in !== undefined) {
                tokensIn = parsed.tokens_in || 0;
                tokensOut = parsed.tokens_out || 0;
              }
            } catch {
              // ignore
            }
          }
        }
      }

      yield {
        type: "done",
        data: { tokens_in: tokensIn, tokens_out: tokensOut, latency_ms: Date.now() - start },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      yield {
        type: "error",
        data: { message: `Station proxy error: ${message}`, retryable: true },
      };
    }
  }
}
