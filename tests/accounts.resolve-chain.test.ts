// Bite 2.6.1 D10 — Resolve chain test
// AC3/AC8: soft-mode chain, subscription-first, fallback on disable
import { describe, it, expect, vi, beforeEach } from "vitest";
import seniorAccounts from "./fixtures/accounts/senior-accounts.json";

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
                  data: f2,
                  error: null,
                };
              },
              order: () => ({ data: filtered, error: null }),
              data: filtered,
              error: null,
            };
          },
          order: () => ({ data: mockAccounts, error: null }),
        }),
        update: () => ({
          eq: () => ({ data: null, error: null, select: () => ({ data: [], error: null }) }),
        }),
        insert: (row: Record<string, unknown>) => {
          mockEvents.push(row);
          return Promise.resolve({ data: null, error: null });
        },
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

describe("resolveAccount chain (soft mode)", () => {
  beforeEach(() => {
    mockAccounts = JSON.parse(JSON.stringify(seniorAccounts));
    mockEvents = [];
  });

  it("AC3a: picks subscription (oauth_max) before api_key in same tier", async () => {
    const result = await resolveAccount({ tier: "senior", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth_type).toBe("oauth_max");
      expect(result.fallback_chain.length).toBeGreaterThan(0);
    }
  });

  it("AC3b: with sub disabled, picks api_key next", async () => {
    // Disable the subscription account
    const sub = mockAccounts.find((a) => (a as Record<string, unknown>).auth_type === "oauth_max") as Record<string, unknown>;
    if (sub) sub.enabled = false;

    const result = await resolveAccount({ tier: "senior", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.auth_type).toBe("api_key");
    }
  });

  it("AC3c: with all anthropic disabled, falls to openai within same tier", async () => {
    // Disable all anthropic accounts
    for (const a of mockAccounts) {
      if ((a as Record<string, unknown>).provider === "anthropic") {
        (a as Record<string, unknown>).enabled = false;
      }
    }

    const result = await resolveAccount({ provider: "anthropic", tier: "senior", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.account.provider).toBe("openai");
    }
  });

  it("AC3d: with all disabled → chain_exhausted", async () => {
    for (const a of mockAccounts) {
      (a as Record<string, unknown>).enabled = false;
    }

    const result = await resolveAccount({ tier: "senior", strict: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("chain_exhausted");
    }
  });
});
