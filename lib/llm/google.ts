import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, Chunk } from "./types";

export class GoogleProvider implements LLMProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
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

    const contents = input.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

    const systemParts: string[] = [];
    if (input.system) systemParts.push(input.system);
    for (const m of input.messages) {
      if (m.role === "system") systemParts.push(m.content);
    }

    try {
      const response = await this.client.models.generateContentStream({
        model: input.model,
        contents,
        config: {
          maxOutputTokens: input.maxTokens || 4096,
          systemInstruction: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        },
      });

      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          yield { type: "token", data: text };
        }
        if (chunk.usageMetadata) {
          tokensIn = chunk.usageMetadata.promptTokenCount || 0;
          tokensOut = chunk.usageMetadata.candidatesTokenCount || 0;
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
