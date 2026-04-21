import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HybridComposer } from "./HybridComposer";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/chat",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock store
vi.mock("@/lib/store/chat", () => ({
  useChatStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        activePersonality: null,
        isStreaming: false,
        setActivePersonality: vi.fn(),
      }),
    {
      getState: () => ({ setActivePersonality: vi.fn(), streamingContent: "" }),
    }
  ),
}));

describe("HybridComposer", () => {
  it("renders textarea", () => {
    render(<HybridComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/Message NOUS/);
    expect(textarea).toBeDefined();
  });

  it("shows slash menu when typing /", () => {
    render(<HybridComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/Message NOUS/);
    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByText("/recall")).toBeDefined();
    expect(screen.getByText("/boardroom")).toBeDefined();
  });

  it("filters slash menu", () => {
    render(<HybridComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/Message NOUS/);
    fireEvent.change(textarea, { target: { value: "/rec" } });
    expect(screen.getByText("/recall")).toBeDefined();
  });
});
