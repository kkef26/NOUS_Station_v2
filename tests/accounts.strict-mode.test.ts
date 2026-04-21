// Bite 2.6.1 D10 — Strict mode test
// AC2: strict request + no matching account → strict_no_match, no fallback
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
                return {
                  order: () => ({ data: f2, error: null }),
                };
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

describe("resolveAccount strict mode", () => {
  beforeEach(() => {
    mockAccounts = [];
    mockEvents = [];
  });

  it("AC2: strict request for google with no google account → strict_no_match", async () => {
    // Only anthropic accounts exist
    mockAccounts = [
      {
        id: "acct-1",
        provider: "anthropic",
        auth_type: "api_key",
        display_label: "Anthropic",
        status: "connected",
        enabled: true,
        priority: 10,
        credential_ref: "enc:test",
        capabilities: {},
        capability_tier: "mid",
        rate_limited_until: null,
      },
    ];

    const result = await resolveAccount({ provider: "google", strict: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("strict_no_match");
      expect(result.attempted_provider).toBe("google");
    }
  });

  it("strict mode returns no fallback_chain even with multiple accounts", async () => {
    mockAccounts = [
      {
        id: "acct-1",
        provider: "anthropic",
        auth_type: "api_key",
        display_label: "Anthropic 1",
        status: "connected",
        enabled: true,
        priority: 10,
        credential_ref: "enc:test1",
        capabilities: {},
        capability_tier: "senior",
        rate_limited_until: null,
      },
      {
        id: "acct-2",
        provider: "anthropic",
        auth_type: "api_key",
        display_label: "Anthropic 2",
        status: "connected",
        enabled: true,
        priority: 20,
        credential_ref: "enc:test2",
        capabilities: {},
        capability_tier: "senior",
        rate_limited_until: null,
      },
    ];

    const result = await resolveAccount({ provider: "anthropic", strict: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fallback_chain).toEqual([]);
    }
  });
});
