"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { PulseDrawer } from "./drawers/PulseDrawer";
import { FactoryDrawer } from "./drawers/FactoryDrawer";
import { FleetDrawer } from "./drawers/FleetDrawer";
import { SignalsDrawer } from "./drawers/SignalsDrawer";

const SURFACES = [
  { label: "Chat", href: "/chat" },
  { label: "Boardroom", href: "/boardroom" },
  { label: "Project", href: "/project/default" },
] as const;

type DrawerName = "pulse" | "factory" | "fleet" | "signals" | null;

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
  const overlayStack = useRef<("drawer" | "composer")[]>([]);

  // Track overlay stack
  useEffect(() => {
    const stack: ("drawer" | "composer")[] = [];
    if (openDrawer) stack.push("drawer");
    if (composerOpen) stack.push("composer");
    overlayStack.current = stack;
  }, [openDrawer, composerOpen]);

  const toggleDrawer = useCallback((name: DrawerName) => {
    setOpenDrawer((prev) => (prev === name ? null : name));
  }, []);

  const closeTopOverlay = useCallback(() => {
    if (composerOpen) {
      setComposerOpen(false);
      return;
    }
    if (openDrawer) {
      setOpenDrawer(null);
      return;
    }
  }, [composerOpen, openDrawer]);

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

  // Global keyboard map
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
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
  }, [router, toggleDrawer, closeTopOverlay, toggleTheme]);

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
        {/* Left: NOUS glyph */}
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

        {/* Center: surface pills */}
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

        {/* Right: avatar + rogue banner mount */}
        <div className="flex items-center gap-3">
          <div data-role="rogue-banner" className="hidden" />
          <div
            className="w-8 h-8 rounded-full"
            style={{ background: "var(--bg-2)" }}
            title="Avatar placeholder"
          />
        </div>
      </header>

      {/* ─── Drawer handles ─── */}
      {/* Top edge: Pulse */}
      <button
        onClick={() => toggleDrawer("pulse")}
        className="w-full h-6 flex items-center justify-center text-xs shrink-0 hover:opacity-80 transition-opacity"
        style={{ background: "var(--bg-1)", color: "var(--ink-1)" }}
      >
        Pulse ⌘P
      </button>

      {/* ─── Main content ─── */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Bottom edge: Factory · Fleet · Signals */}
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

      {/* ─── Drawers ─── */}
      {openDrawer === "pulse" && (
        <PulseDrawer onClose={() => setOpenDrawer(null)} />
      )}
      {openDrawer === "factory" && (
        <FactoryDrawer onClose={() => setOpenDrawer(null)} />
      )}
      {openDrawer === "fleet" && (
        <FleetDrawer onClose={() => setOpenDrawer(null)} />
      )}
      {openDrawer === "signals" && (
        <SignalsDrawer onClose={() => setOpenDrawer(null)} />
      )}

      {/* ─── Composer sheet placeholder ─── */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setComposerOpen(false)}>
          <div className="scrim absolute inset-0" />
          <div
            className="relative w-full drawer-bottom-enter rounded-t-xl p-6"
            style={{ background: "var(--bg-1)", maxHeight: "50vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--bg-2)" }} />
            <h3 className="text-sm font-medium mb-2" style={{ color: "var(--accent-teal)" }}>
              Hybrid Composer
            </h3>
            <p className="text-sm" style={{ color: "var(--ink-1)" }}>
              Wire-in pending — lands in a later bite. ⌘K to toggle.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
