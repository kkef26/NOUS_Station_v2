import { describe, it, expect, vi } from "vitest";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Hello" },
            };
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: " world" },
            };
          },
          finalMessage: vi.fn().mockResolvedValue({
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
        }),
      };
    },
  };
});

const { AnthropicProvider } = await import("./anthropic");

describe("AnthropicProvider", () => {
  it("emits token and done chunks", async () => {
    // Pass apiKey directly — never read from process.env
    const provider = new AnthropicProvider("test-key");
    const chunks = [];

    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
    })) {
      chunks.push(chunk);
    }

    const tokens = chunks.filter((c) => c.type === "token");
    expect(tokens.length).toBeGreaterThanOrEqual(1);

    const done = chunks.find((c) => c.type === "done");
    expect(done).toBeDefined();
    expect(done?.type === "done" && done.data.tokens_in).toBe(10);
  });
});
