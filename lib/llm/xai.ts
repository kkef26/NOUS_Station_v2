import type { LLMProvider, Chunk } from "./types";

export class XAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl = "https://api.x.ai/v1/chat/completions";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async *stream(input: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    system?: string;
    model: string;
    maxTokens?: number;
  }): AsyncIterable<Chunk> {
    const start = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;

    const messages: Array<{ role: string; content: string }> = [];
    if (input.system) {
      messages.push({ role: "system", content: input.system });
    }
    messages.push(...input.messages);

    try {
      const resp = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: input.maxTokens || 4096,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        yield { type: "error", data: { message: `xAI API error ${resp.status}: ${body}`, retryable: resp.status >= 500 } };
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        yield { type: "error", data: { message: "No response body from xAI", retryable: false } };
        return;
      }

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
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              yield { type: "token", data: delta.content };
            }
            if (parsed.usage) {
              tokensIn = parsed.usage.prompt_tokens || 0;
              tokensOut = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      yield {
        type: "done",
        data: { tokens_in: tokensIn, tokens_out: tokensOut, latency_ms: Date.now() - start },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", data: { message, retryable: false } };
    }
  }
}
