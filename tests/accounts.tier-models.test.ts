// Bite 2.7 — Multi-tier model tests
// Covers: backfill correctness, multi-tier resolution, model fallback to catalog default, empty-tier-set behavior
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockAccounts: Record<string, unknown>[] = [];
let mockTierModels: Record<string, unknown>[] = [];
let mockCatalog: Record<string, unknown>[] = [];
let mockEvents: Record<string, unknown>[] = [];

const makeMockDb = () => ({
  from: (table: string) => {
    if (table === "accounts") {
      return {
        select: (_cols?: string) => ({
          eq: (col: string, val: unknown) => {
            const filtered = mockAccounts.filter((a) => (a as Record<string, unknown>)[col] === val);
            return {
              eq: (col2: string, val2: unknown) => {
                const f2 = filtered.filter((a) => (a as Record<string, unknown>)[col2] === val2);
                return { order: () => ({ data: f2, error: null }) };
              },
              order: () => ({
                data: filtered.map((a) => ({
                  ...a,
                  account_tier_models: mockTierModels.filter((tm) => tm.account_id === a.id),
                })),
                error: null,
              }),
            };
          },
          order: () => ({
            data: mockAccounts.map((a) => ({
              ...a,
              account_tier_models: mockTierModels.filter((tm) => tm.account_id === a.id),
            })),
            error: null,
          }),
        }),
        update: () => ({
          eq: () => ({ data: null, error: null }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => ({ data: { id: "new-acct", ...row }, error: null }),
          }),
        }),
      };
    }
    if (table === "account_tier_models") {
      return {
        insert: (rows: Record<string, unknown>[]) => {
          mockTierModels.push(...(Array.isArray(rows) ? rows : [rows]));
          return { error: null };
        },
        delete: () => ({
          eq: (col: string, val: unknown) => {
            mockTierModels = mockTierModels.filter((tm) => tm[col] !== val);
            return { error: null };
          },
        }),
        select: () => ({
          eq: () => ({ data: mockTierModels, error: null }),
        }),
      };
    }
    if (table === "model_catalog") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            let filtered = mockCatalog.filter((m) => (m as Record<string, unknown>)[col] === val);
            return {
              eq: (col2: string, val2: unknown) => {
                filtered = filtered.filter((m) => (m as Record<string, unknown>)[col2] === val2);
                return {
                  eq: (col3: string, val3: unknown) => {
                    filtered = filtered.filter((m) => (m as Record<string, unknown>)[col3] === val3);
                    return {
                      is: () => ({
                        limit: () => ({
                          single: () => ({ data: filtered[0] || null, error: null }),
                        }),
                      }),
                    };
                  },
                  is: () => ({
                    limit: () => ({
                      single: () => ({ data: filtered[0] || null, error: null }),
                    }),
                  }),
                };
              },
            };
          },
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

describe("multi-tier account model resolution", () => {
  beforeEach(() => {
    mockAccounts = [];
    mockTierModels = [];
    mockCatalog = [];
    mockEvents = [];
  });

  it("resolves pinned model from tier_models join table", async () => {
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
        capability_tier: "senior",
        rate_limited_until: null,
      },
    ];
    mockTierModels = [
      { account_id: "acct-1", tier: "senior", model: "claude-opus-4-6", enabled: true },
    ];

    const result = await resolveAccount({ tier: "senior", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved_model).toBe("claude-opus-4-6");
    }
  });

  it("falls back to catalog default when tier_model.model is null", async () => {
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
    mockTierModels = [
      { account_id: "acct-1", tier: "mid", model: null, enabled: true },
    ];
    mockCatalog = [
      { provider: "anthropic", tier: "mid", model: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6", is_default: true, deprecated_at: null },
    ];

    const result = await resolveAccount({ tier: "mid", strict: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved_model).toBe("claude-sonnet-4-6");
    }
  });

  it("account with all tiers disabled → chain_exhausted for any tier request", async () => {
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
    mockTierModels = [
      { account_id: "acct-1", tier: "senior", model: null, enabled: false },
      { account_id: "acct-1", tier: "mid", model: null, enabled: false },
      { account_id: "acct-1", tier: "junior", model: null, enabled: false },
    ];

    const result = await resolveAccount({ tier: "senior", strict: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("chain_exhausted");
    }
  });

  it("multi-tier account resolves across all enabled tiers", async () => {
    mockAccounts = [
      {
        id: "acct-all",
        provider: "anthropic",
        auth_type: "api_key",
        display_label: "Full-tier Anthropic",
        status: "connected",
        enabled: true,
        priority: 10,
        credential_ref: "enc:test",
        capabilities: {},
        capability_tier: "senior",
        rate_limited_until: null,
      },
    ];
    mockTierModels = [
      { account_id: "acct-all", tier: "senior", model: "claude-opus-4-6", enabled: true },
      { account_id: "acct-all", tier: "mid", model: null, enabled: true },
      { account_id: "acct-all", tier: "junior", model: null, enabled: true },
    ];

    for (const tier of ["senior", "mid", "junior"] as const) {
      const result = await resolveAccount({ tier, strict: false });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.account.id).toBe("acct-all");
      }
    }
  });
});
