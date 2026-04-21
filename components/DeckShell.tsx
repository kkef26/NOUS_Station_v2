"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { PulseDrawer } from "./drawers/PulseDrawer";
import { FactoryDrawer } from "./drawers/FactoryDrawer";
import { FleetDrawer } from "./drawers/FleetDrawer";
import { SignalsDrawer } from "./drawers/SignalsDrawer";
import { HybridComposer } from "./HybridComposer";

const SURFACES = [
  { label: "Chat", href: "/chat" },
  { label: "Boardroom", href: "/boardroom" },
  { label: "Project", href: "/project/default" },
] as const;

type DrawerName = "pulse" | "factory" | "fleet" | "signals" | null;

const SHORTCUTS = [
  { keys: "⌘1", desc: "Chat" },
  { keys: "⌘2", desc: "Boardroom" },
  { keys: "⌘3", desc: "Project" },
  { keys: "⌘P", desc: "Toggle Pulse drawer" },
  { keys: "⌘F", desc: "Toggle Factory drawer" },
  { keys: "⌘L", desc: "Toggle Fleet drawer" },
  { keys: "⌘S", desc: "Toggle Signals drawer" },
  { keys: "⌘K", desc: "Toggle Composer" },
  { keys: "⌘,", desc: "Settings" },
  { keys: "⌘⇧T", desc: "Toggle theme" },
  { keys: "⌘⇧↵", desc: "Fork to new thread" },
  { keys: "⌘G", desc: "Toggle density (global/compact)" },
  { keys: "⌘.", desc: "Cycle personality" },
  { keys: "N", desc: "New thread (Chat) / Focus topic (Boardroom)" },
  { keys: "J / K", desc: "Next / Prev thread" },
  { keys: "/", desc: "Focus composer with slash" },
  { keys: "?", desc: "This help modal" },
  { keys: "Esc", desc: "Close top overlay" },
];

export function DeckShell({
  children,
  surfaceLabel,
}: {
  children: React.ReactNode;
  surfaceLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openDrawer, setOpenDrawer] = useState<DrawerName>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const overlayStack = useRef<string[]>([]);

  useEffect(() => {
    const stack: string[] = [];
    if (openDrawer) stack.push("drawer");
    if (composerOpen) stack.push("composer");
    if (helpOpen) stack.push("help");
    overlayStack.current = stack;
  }, [openDrawer, composerOpen, helpOpen]);

  const toggleDrawer = useCallback((name: DrawerName) => {
    setOpenDrawer((prev) => (prev === name ? null : name));
  }, []);

  const closeTopOverlay = useCallback(() => {
    if (helpOpen) { setHelpOpen(false); return; }
    if (composerOpen) { setComposerOpen(false); return; }
    if (openDrawer) { setOpenDrawer(null); return; }
  }, [helpOpen, composerOpen, openDrawer]);

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "light" ? null : "light";
    if (next) {
      html.setAttribute("data-theme", next);
      localStorage.setItem("nous-theme", next);
    } else {
      html.removeAttribute("data-theme");
      localStorage.removeItem("nous-theme");
    }
  }, []);

  const toggleDensity = useCallback(() => {
    const current = localStorage.getItem("nst_density") || "global";
    const next = current === "global" ? "compact" : "global";
    localStorage.setItem("nst_density", next);
  }, []);

  // Global keyboard map
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // ? for help (no meta, no input focus)
      if (
        !meta &&
        e.key === "?" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setHelpOpen((p) => !p);
        return;
      }

      if (!meta) return;

      // ⌘⇧T — theme toggle
      if (e.shiftKey && e.key === "T") {
        e.preventDefault();
        toggleTheme();
        return;
      }

      if (e.shiftKey) return;

      switch (e.key) {
        case "1":
          e.preventDefault();
          router.push("/chat");
          break;
        case "2":
          e.preventDefault();
          router.push("/boardroom");
          break;
        case "3":
          e.preventDefault();
          router.push("/project/default");
          break;
        case "p":
          e.preventDefault();
          toggleDrawer("pulse");
          break;
        case "f":
          e.preventDefault();
          toggleDrawer("factory");
          break;
        case "l":
          e.preventDefault();
          toggleDrawer("fleet");
          break;
        case "s":
          e.preventDefault();
          toggleDrawer("signals");
          break;
        case "k":
          e.preventDefault();
          setComposerOpen((p) => !p);
          break;
        case ",":
          e.preventDefault();
          router.push("/settings");
          break;
        case "g":
          e.preventDefault();
          toggleDensity();
          break;
        case ".":
          e.preventDefault();
          // Cycle personality — handled in HybridComposer
          break;
      }
    }

    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeTopOverlay();
      }
    }

    window.addEventListener("keydown", handleKey);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [router, toggleDrawer, closeTopOverlay, toggleTheme, toggleDensity]);

  const activeSurface = (href: string) => {
    if (href === "/project/default") return pathname.startsWith("/project");
    return pathname === href;
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-0)" }}>
      {/* ─── Top bar (56px) ─── */}
      <header
        className="h-14 flex items-center justify-between px-4 shrink-0 border-b"
        style={{ background: "var(--bg-1)", borderColor: "var(--bg-2)" }}
      >
        <div className="breathing flex items-center gap-2">
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="NOUS"
          >
            <circle cx="14" cy="14" r="12" stroke="var(--accent-teal)" strokeWidth="1.5" fill="none" />
            <circle cx="14" cy="14" r="4" fill="var(--accent-teal)" />
            <path d="M14 2 L14 6" stroke="var(--accent-teal)" strokeWidth="1" />
            <path d="M14 22 L14 26" stroke="var(--accent-teal)" strokeWidth="1" />
            <path d="M2 14 L6 14" stroke="var(--accent-teal)" strokeWidth="1" />
            <path d="M22 14 L26 14" stroke="var(--accent-teal)" strokeWidth="1" />
          </svg>
          <span className="text-sm font-medium" style={{ color: "var(--accent-teal)" }}>
            NOUS
          </span>
        </div>

        <nav className="flex gap-1">
          {SURFACES.map((s) => (
            <button
              key={s.href}
              onClick={() => router.push(s.href)}
              className="px-3 py-1.5 text-sm rounded-full transition-colors"
              style={{
                background: activeSurface(s.href) ? "var(--accent-teal)" : "transparent",
                color: activeSurface(s.href) ? "var(--bg-0)" : "var(--ink-1)",
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div data-role="rogue-banner" className="hidden" />
          <div
            className="w-8 h-8 rounded-full"
            style={{ background: "var(--bg-2)" }}
            title="Avatar placeholder"
          />
        </div>
      </header>

      {/* Top edge: Pulse */}
      <button
        onClick={() => toggleDrawer("pulse")}
        className="w-full h-6 flex items-center justify-center text-xs shrink-0 hover:opacity-80 transition-opacity"
        style={{ background: "var(--bg-1)", color: "var(--ink-1)" }}
      >
        Pulse ⌘P
      </button>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Bottom edge */}
      <div
        className="h-6 flex items-center justify-center gap-6 text-xs shrink-0"
        style={{ background: "var(--bg-1)", color: "var(--ink-1)" }}
      >
        <button onClick={() => toggleDrawer("factory")} className="hover:opacity-80 transition-opacity">
          Factory ⌘F
        </button>
        <button onClick={() => toggleDrawer("fleet")} className="hover:opacity-80 transition-opacity">
          Fleet ⌘L
        </button>
        <button onClick={() => toggleDrawer("signals")} className="hover:opacity-80 transition-opacity">
          Signals ⌘S
        </button>
      </div>

      {/* Drawers */}
      {openDrawer === "pulse" && <PulseDrawer onClose={() => setOpenDrawer(null)} />}
      {openDrawer === "factory" && <FactoryDrawer onClose={() => setOpenDrawer(null)} />}
      {openDrawer === "fleet" && <FleetDrawer onClose={() => setOpenDrawer(null)} />}
      {openDrawer === "signals" && <SignalsDrawer onClose={() => setOpenDrawer(null)} />}

      {/* Composer sheet (non-chat routes, triggered by ⌘K) */}
      {composerOpen && pathname !== "/chat" && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setComposerOpen(false)}>
          <div className="scrim absolute inset-0" />
          <div
            className="relative w-full drawer-bottom-enter rounded-t-xl p-4"
            style={{ background: "var(--bg-1)", maxHeight: "50vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: "var(--bg-2)" }} />
            <HybridComposer
              isSheet
              onSend={(msg) => {
                // Create thread and route to chat
                setComposerOpen(false);
                router.push(`/chat`);
                // The chat page will handle the message via URL state or store
              }}
            />
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setHelpOpen(false)}>
          <div className="scrim absolute inset-0" />
          <div
            className="relative rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            style={{ background: "var(--bg-1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-medium mb-4" style={{ color: "var(--accent-teal)" }}>
              Keyboard Shortcuts
            </h2>
            <div className="flex flex-col gap-2">
              {SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex justify-between text-sm">
                  <span
                    className="font-mono text-xs px-2 py-0.5 rounded"
                    style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
                  >
                    {s.keys}
                  </span>
                  <span style={{ color: "var(--ink-1)" }}>{s.desc}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-4 w-full text-sm py-2 rounded-lg"
              style={{ background: "var(--bg-2)", color: "var(--ink-0)" }}
            >
              Close (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
