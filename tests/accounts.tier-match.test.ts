// Bite 2.6.1 D10 — Tier matching test
// AC: senior-tier request with only mid/junior → tier_fallback_down annotation
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockAccounts: Record<string, unknown>[] = [];
let mockEvents: Record<string, unknown>[] = [];

const makeMockDb = () => ({
  from: (table: string) => {
    if (table === "accounts") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            const filtered = mockAccounts.filter((a) => (a as Record<string, unknown>)[col] === val);
            return {
              eq: (col2: string, val2: unknown) => {
                const f2 = filtered.filter((a) => (a as Record<string, unknown>)[col2] === val2);
                return { order: () => ({ data: f2, error: null }) };
              },
              order: () => ({ data: filtered, error: null }),
            };
          },
          order: () => ({ data: mockAccounts, error: null }),
        }),
        update: () => ({
          eq: () => ({ data: null, error: null }),
        }),
      };
    }
    if (table === "account_usage_events") {
      return {
        insert: (row: Record<string, unknown>) => {
          mockEvents.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
  },
});

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => makeMockDb(),
}));

vi.mock("@/lib/accounts/crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

const { resolveAccount } = await import("@/lib/accounts/resolve");

describe("tier matching fallback", () => {
  beforeEach(() => {
    mockAccounts = [];
    mockEvents = [];
  });

  it("senior request with only mid accounts → tier_fallback_down + still returns result", async () => {
    mockAccounts = [
      {
        id: "acct-mid-1",
        provider: "anthropic",
        auth_type: "api_key",
        display_label: "Mid Anthropic",
        status: "connected",
        enabled: true,
        priority: 10,
        credential_ref: "enc:test",
        capabilities: {},
        capability_tier: "mid",
        rate_limited_until: null,
      },
    ];

    const result = await resolveAccount({ tier: "senior", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reason).toBe("tier_fallback_down");
      expect(result.account.capability_tier).toBe("mid");
    }
  });

  it("junior request with only mid accounts → tier_fallback_up", async () => {
    mockAccounts = [
      {
        id: "acct-mid-1",
        provider: "openai",
        auth_type: "api_key",
        display_label: "Mid OpenAI",
        status: "connected",
        enabled: true,
        priority: 10,
        credential_ref: "enc:test",
        capabilities: {},
        capability_tier: "mid",
        rate_limited_until: null,
      },
    ];

    const result = await resolveAccount({ tier: "junior", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reason).toBe("tier_fallback_up");
      expect(result.account.capability_tier).toBe("mid");
    }
  });
});
