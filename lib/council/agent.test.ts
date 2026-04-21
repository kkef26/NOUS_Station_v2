import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          data: [
            { slug: "strata", name: "STRATA", role: "ARCHITECT", system_prompt: "...", default_provider: "anthropic", default_model: "claude-sonnet-4-6", active: true },
            { slug: "gauntlet", name: "GAUNTLET", role: "TESTER", system_prompt: "...", default_provider: "anthropic", default_model: "claude-sonnet-4-6", active: true },
            { slug: "scout", name: "SCOUT", role: "MARKET", system_prompt: "...", default_provider: "openai", default_model: "gpt-4o", active: true },
            { slug: "jarvis", name: "JARVIS", role: "COORDINATOR", system_prompt: "...", default_provider: "anthropic", default_model: "claude-opus-4-6", active: true },
            { slug: "atlas", name: "ATLAS", role: "HISTORIAN", system_prompt: "...", default_provider: "anthropic", default_model: "claude-sonnet-4-6", active: true },
            { slug: "sniper", name: "SNIPER", role: "ANALYST", system_prompt: "...", default_provider: "anthropic", default_model: "claude-sonnet-4-6", active: true },
          ],
          error: null,
        }),
      }),
    }),
  }),
}));

// Need to dynamically import after mock setup
const { routeBoardroomTopic } = await import("./agent");

describe("routeBoardroomTopic", () => {
  it("returns seats for a design topic", async () => {
    const result = await routeBoardroomTopic("design a login page");
    expect(result.seats.length).toBeGreaterThanOrEqual(1);
    // strata should be matched by "design"
    expect(result.seats.some((s) => s.personality === "strata")).toBe(true);
    expect(result.chair).toBeDefined();
  });

  it("returns seats for a test topic", async () => {
    const result = await routeBoardroomTopic("stress test the API");
    expect(result.seats.some((s) => s.personality === "gauntlet")).toBe(true);
  });

  it("includes pinned seats", async () => {
    const result = await routeBoardroomTopic("random topic", {
      pinnedSeats: ["scout"],
    });
    expect(result.seats.some((s) => s.personality === "scout")).toBe(true);
  });

  it("respects maxSeats", async () => {
    const result = await routeBoardroomTopic("design a system with tests", {
      maxSeats: 3,
    });
    expect(result.seats.length).toBeLessThanOrEqual(3);
  });
});
