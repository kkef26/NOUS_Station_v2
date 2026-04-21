import OpenAI from "openai";
import type { LLMProvider, Chunk } from "./types";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey });
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

    const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
    if (input.system) {
      messages.push({ role: "system", content: input.system });
    }
    messages.push(...input.messages);

    try {
      const stream = await this.client.chat.completions.create({
        model: input.model,
        max_tokens: input.maxTokens || 4096,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: "token", data: delta.content };
        }
        if (chunk.usage) {
          tokensIn = chunk.usage.prompt_tokens || 0;
          tokensOut = chunk.usage.completion_tokens || 0;
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
