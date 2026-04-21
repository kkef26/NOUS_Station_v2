// Bite 2.6.1 D10 — Rate limit test
// AC4: 429 → account flipped to rate_limited, rate_limited_until populated
import { describe, it, expect, vi, beforeEach } from "vitest";
import rateLimitFixtures from "./fixtures/accounts/rate-limit-headers.json";

let mockAccountUpdates: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => {
        mockAccountUpdates.push({ table, patch });
        return {
          eq: () => ({
            then: (fn: (r: { error: null }) => void) => fn({ error: null }),
          }),
        };
      },
    }),
  }),
}));

const { parseRateLimitHeaders, mark429 } = await import("@/lib/accounts/rate-limit");

describe("rate-limit parsing", () => {
  beforeEach(() => {
    mockAccountUpdates = [];
  });

  it("parses Anthropic rate-limit headers", () => {
    const headers = new Headers(rateLimitFixtures.anthropic_ok.headers);
    const info = parseRateLimitHeaders("anthropic", headers);
    expect(info.tokens_remaining).toBe(342000);
    expect(info.requests_remaining).toBe(95);
  });

  it("parses OpenAI rate-limit headers", () => {
    const headers = new Headers(rateLimitFixtures.openai_ok.headers);
    const info = parseRateLimitHeaders("openai", headers);
    expect(info.tokens_remaining).toBe(150000);
    expect(info.requests_remaining).toBe(58);
  });

  it("AC4: mark429 flips account to rate_limited with rate_limited_until", async () => {
    const headers = new Headers(rateLimitFixtures.anthropic_429.headers);
    const mockResp = new Response(null, { status: 429, headers });

    const result = await mark429("acct-test-1", "anthropic", mockResp);

    expect(result.retry_after_seconds).toBe(300);
    expect(mockAccountUpdates.length).toBe(1);
    const update = mockAccountUpdates[0].patch as Record<string, unknown>;
    expect(update.status).toBe("rate_limited");
    expect(update.status_source).toBe("runtime_error");
    expect(update.rate_limited_until).toBeDefined();
  });
});
