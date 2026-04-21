export type Chunk =
  | { type: "token"; data: string }
  | { type: "done"; data: { tokens_in: number; tokens_out: number; latency_ms: number } }
  | { type: "error"; data: { message: string; retryable: boolean } };

export interface LLMProvider {
  stream(input: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    system?: string;
    model: string;
    maxTokens?: number;
  }): AsyncIterable<Chunk>;
}
