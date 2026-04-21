import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Chunk } from "./types";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey });
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

    // Filter out system messages from messages array, use system param instead
    const messages = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const systemParts: string[] = [];
    if (input.system) systemParts.push(input.system);
    for (const m of input.messages) {
      if (m.role === "system") systemParts.push(m.content);
    }

    try {
      const stream = this.client.messages.stream({
        model: input.model,
        max_tokens: input.maxTokens || 4096,
        system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        messages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          tokensOut++;
          yield { type: "token", data: event.delta.text };
        }
      }

      const finalMessage = await stream.finalMessage();
      tokensIn = finalMessage.usage?.input_tokens || 0;
      tokensOut = finalMessage.usage?.output_tokens || 0;

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
