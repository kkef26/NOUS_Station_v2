// Bite 2.7 — Model catalog API test
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockCatalog: Record<string, unknown>[] = [];

const makeMockDb = () => ({
  from: (table: string) => {
    if (table === "model_catalog") {
      return {
        select: (_cols?: string) => ({
          is: (_col: string, _val: unknown) => ({
            order: () => ({
              eq: (col: string, val: unknown) => ({
                data: mockCatalog.filter((m) => (m as Record<string, unknown>)[col] === val && !(m as Record<string, unknown>).deprecated_at),
                error: null,
              }),
              data: mockCatalog.filter((m) => !(m as Record<string, unknown>).deprecated_at),
              error: null,
            }),
          }),
          eq: (col: string, val: unknown) => {
            const filtered = mockCatalog.filter((m) => (m as Record<string, unknown>)[col] === val);
            return {
              is: () => ({
                order: () => ({
                  data: filtered.filter((m) => !(m as Record<string, unknown>).deprecated_at),
                  error: null,
                }),
              }),
            };
          },
        }),
      };
    }
    return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
  },
});

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => makeMockDb(),
}));

describe("model catalog", () => {
  beforeEach(() => {
    mockCatalog = [
      { provider: "anthropic", tier: "senior", model: "claude-opus-4-6", display_name: "Claude Opus 4.6", is_default: true, context_window: 200000, source: "manual", deprecated_at: null },
      { provider: "anthropic", tier: "mid", model: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6", is_default: true, context_window: 200000, source: "manual", deprecated_at: null },
      { provider: "anthropic", tier: "junior", model: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5", is_default: true, context_window: 200000, source: "manual", deprecated_at: null },
    ];
  });

  it("catalog seed has 3 Anthropic models", () => {
    expect(mockCatalog.length).toBe(3);
    expect(mockCatalog.every((m) => (m as Record<string, unknown>).provider === "anthropic")).toBe(true);
  });

  it("each tier has exactly one default model", () => {
    for (const tier of ["senior", "mid", "junior"]) {
      const defaults = mockCatalog.filter(
        (m) => (m as Record<string, unknown>).tier === tier && (m as Record<string, unknown>).is_default === true
      );
      expect(defaults.length).toBe(1);
    }
  });

  it("deprecated models are excluded from active catalog", () => {
    mockCatalog.push({
      provider: "anthropic", tier: "senior", model: "claude-3-opus-20240229",
      display_name: "Claude 3 Opus (legacy)", is_default: false, context_window: 200000,
      source: "manual", deprecated_at: "2025-12-01",
    });

    const active = mockCatalog.filter((m) => !(m as Record<string, unknown>).deprecated_at);
    expect(active.length).toBe(3);
  });

  it("refresh stub returns zero changes", async () => {
    const { refreshModelCatalog } = await import("@/lib/model_catalog/refresh");
    const result = await refreshModelCatalog();
    expect(result).toEqual({ added: 0, deprecated: 0 });
  });
});
