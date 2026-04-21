// Gate test — NST.19.7 r3 §Deliverables.11
// AC06: resolveAccount blocks disabled accounts and passes enabled ones.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock Supabase with a stateful in-memory store
let mockAccounts: Record<string, unknown>[] = [];
let mockEvents: Record<string, unknown>[] = [];

const makeMockDb = () => ({
  from: (table: string) => {
    if (table === "accounts") {
      return {
        select: (cols: string) => ({
          eq: (col: string, val: unknown) => ({
            eq: (col2: string, val2: unknown) => ({
              eq: (col3: string, val3: unknown) => ({
                order: () => ({
                  data: mockAccounts.filter(
                    (a) => (a as Record<string, unknown>)[col] === val &&
                           (a as Record<string, unknown>)[col2] === val2 &&
                           (a as Record<string, unknown>)[col3] === val3
                  ),
                  error: null,
                }),
              }),
              data: mockAccounts.filter(
                (a) => (a as Record<string, unknown>)[col] === val &&
                       (a as Record<string, unknown>)[col2] === val2
              ),
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({ data: null, error: null }),
        }),
        insert: (row: Record<string, unknown>) => {
          mockAccounts.push({ id: `acc-${mockAccounts.length}`, ...row });
          return { data: null, error: null };
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

const FAKE_CRED = "enc:fake-key-123";

describe("resolveAccount gate", () => {
  beforeAll(() => {
    mockAccounts = [];
    mockEvents = [];
    // Insert fixture: disabled anthropic account
    mockAccounts.push({
      id: "acct-fixture-1",
      provider: "anthropic",
      auth_type: "api_key",
      display_label: "Test Anthropic Key",
      status: "connected",
      enabled: false,
      priority: 100,
      credential_ref: FAKE_CRED,
      capabilities: {},
    });
  });

  afterAll(() => {
    mockAccounts = [];
    mockEvents = [];
  });

  it("AC06a: blocks when account is disabled", async () => {
    const result = await resolveAccount({ provider: "anthropic", purpose: "chat" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("no_enabled_account");
    }
  });

  it("AC06b: passes when account is enabled", async () => {
    // Enable the account
    const acct = mockAccounts.find((a) => (a as Record<string, unknown>).id === "acct-fixture-1") as Record<string, unknown>;
    if (acct) acct.enabled = true;

    const result = await resolveAccount({ provider: "anthropic", purpose: "chat" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential).toBe("fake-key-123");
    }
  });
});
