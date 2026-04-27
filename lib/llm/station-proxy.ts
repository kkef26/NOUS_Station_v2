import type { LLMProvider, Chunk } from "./types";

/**
 * StationProxyProvider — routes LLM calls through the Station Proxy at EC2.
 * The proxy handles all providers (Anthropic via OAuth, OpenAI/Google/xAI/DeepSeek via API keys).
 *
 * Credential resolution:
 *   - If credential is a real API key string, use it directly
 *   - If credential is "station_proxy" (sentinel from resolveAccount), fall back to env vars
 *
 * SSE format varies by provider:
 *   Anthropic:     {type:"content", text:"..."} → {type:"done", result:"...", usage:{input_tokens,output_tokens}}
 *   Non-Anthropic: {type:"content_block_delta", delta:{type:"text_delta", text:"..."}} → {type:"message_stop", usage:{}}
 */
export class StationProxyProvider implements LLMProvider {
  private apiKey: string;
  private proxyUrl: string;

  constructor(credential: string) {
    // Resolve actual API key: sentinel "station_proxy" means look up from env
    this.apiKey = credential === "station_proxy"
      ? (process.env.STATION_PROXY_API_KEY || process.env.NOUS_API_KEY || "")
      : credential;
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
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            // Anthropic format: {type:"content", text:"..."}
            if (parsed.type === "content" && typeof parsed.text === "string") {
              yield { type: "token", data: parsed.text };
            }
            // Non-Anthropic format: {type:"content_block_delta", delta:{type:"text_delta", text:"..."}}
            else if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              yield { type: "token", data: parsed.delta.text };
            }
            // Anthropic done: {type:"done", result:"...", usage:{input_tokens, output_tokens}}
            else if (parsed.type === "done" && parsed.usage) {
              tokensIn = parsed.usage?.input_tokens || 0;
              tokensOut = parsed.usage?.output_tokens || 0;
            }
            // Non-Anthropic done: {type:"message_stop", usage:{}}
            else if (parsed.type === "message_stop") {
              // Usage often empty for non-Anthropic — that's fine
            }
            // Error from proxy
            else if (parsed.type === "error") {
              yield { type: "error", data: { message: parsed.text || parsed.error || "Proxy error", retryable: false } };
              return;
            }
          } catch {
            // Unparseable line — skip
          }
        }
      }

      // Drain remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        const data = buffer.trim().slice(6).trim();
        if (data && data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content" && typeof parsed.text === "string") {
              yield { type: "token", data: parsed.text };
            } else if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              yield { type: "token", data: parsed.delta.text };
            } else if (parsed.type === "done" && parsed.usage) {
              tokensIn = parsed.usage?.input_tokens || 0;
              tokensOut = parsed.usage?.output_tokens || 0;
            }
          } catch {
            // ignore
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
