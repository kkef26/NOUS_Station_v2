import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Set env before import
process.env.ANTHROPIC_API_KEY = "test-key";

const { AnthropicProvider } = await import("./anthropic");

describe("AnthropicProvider", () => {
  it("emits token and done chunks", async () => {
    const provider = new AnthropicProvider();
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
