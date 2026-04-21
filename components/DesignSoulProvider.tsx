"use client";

/**
 * DesignSoulProvider — NST.19.7 r3 Bite 2.8
 *
 * Mounts the living-system substrate:
 * - Polls /api/status every 30s for color temperature
 * - Listens for NOUS events on PULSE-1 channel
 * - Renders connectivity arcs SVG overlay
 * - Applies level-gated visual unlocks
 * - Respects prefers-reduced-motion
 * - Supports ?state=X and ?level=X debug params
 */

import { useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  computeSystemState,
  applyColorTemperature,
  handleNousEvent,
  applyLevelGating,
  spawnArc,
  type SystemState,
  type PulseEvent,
  type ArcTrigger,
  type LevelResult,
} from "@/lib/design-soul";

const STATUS_POLL_INTERVAL = 30_000;

export function DesignSoulProvider() {
  const searchParams = useSearchParams();
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reducedMotion = useRef(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      reducedMotion.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ─── COLOR TEMPERATURE POLLING ─────────────────────────
  const pollStatus = useCallback(async () => {
    // Debug param override
    const debugState = searchParams.get("state") as SystemState | null;
    if (debugState && ["calm", "working", "stressed", "overloaded"].includes(debugState)) {
      applyColorTemperature(debugState);
      return;
    }

    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();
      const state = computeSystemState(
        data.queue_depth ?? 0,
        data.error_rate ?? 0,
        data.active_workers ?? 0
      );
      applyColorTemperature(state);
    } catch {
      // Best-effort — don't break the UI on status poll failure
    }
  }, [searchParams]);

  useEffect(() => {
    pollStatus();
    statusTimerRef.current = setInterval(pollStatus, STATUS_POLL_INTERVAL);
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, [pollStatus]);

  // ─── LEVEL GATING ──────────────────────────────────────
  useEffect(() => {
    const debugLevel = searchParams.get("level");
    if (debugLevel) {
      const lvl = parseInt(debugLevel.replace("L", ""), 10);
      if (lvl >= 1 && lvl <= 5) {
        applyLevelGating(lvl);
        return;
      }
    }

    // Fetch real level
    fetch("/api/level")
      .then((r) => r.json())
      .then((data: LevelResult) => {
        applyLevelGating(data.level ?? 1);
      })
      .catch(() => {
        applyLevelGating(1); // Default to L1
      });
  }, [searchParams]);

  // ─── PULSE EVENT LISTENER ─────────────────────────────
  // Listen for custom DOM events from the NOUS event stream
  useEffect(() => {
    function onNousPulse(e: Event) {
      if (reducedMotion.current) return;
      const detail = (e as CustomEvent).detail;
      if (detail?.event_type) {
        handleNousEvent(detail);
      }
    }

    function onNousArc(e: Event) {
      if (reducedMotion.current) return;
      const detail = (e as CustomEvent).detail;
      if (detail?.trigger) {
        spawnArc(detail.trigger as ArcTrigger);
      }
    }

    window.addEventListener("nous:pulse", onNousPulse);
    window.addEventListener("nous:arc", onNousArc);
    return () => {
      window.removeEventListener("nous:pulse", onNousPulse);
      window.removeEventListener("nous:arc", onNousArc);
    };
  }, []);

  // ─── NOUS EVENT STREAM (PULSE-1 channel) ───────────────
  useEffect(() => {
    // Connect to NOUS event stream if available
    try {
      const es = new EventSource("/api/pulse/events");
      eventSourceRef.current = es;

      es.addEventListener("PULSE-1", (e) => {
        try {
          const data = JSON.parse(e.data);
          // Fire DOM event for pulse handling
          window.dispatchEvent(
            new CustomEvent("nous:pulse", { detail: data })
          );

          // Check for arc-triggering events
          if (data.event_type === "memory:attach") {
            window.dispatchEvent(
              new CustomEvent("nous:arc", {
                detail: { trigger: "memory-clause-attach" },
              })
            );
          } else if (data.event_type === "signal:bind") {
            window.dispatchEvent(
              new CustomEvent("nous:arc", {
                detail: { trigger: "signal-project-bind" },
              })
            );
          } else if (data.event_type === "dispatch:memory-write") {
            window.dispatchEvent(
              new CustomEvent("nous:arc", {
                detail: { trigger: "dispatch-memory-write" },
              })
            );
          }
        } catch {
          // malformed event data — ignore
        }
      });

      es.onerror = () => {
        // SSE connection dropped — will auto-reconnect
      };

      return () => {
        es.close();
        eventSourceRef.current = null;
      };
    } catch {
      // EventSource not supported or URL not available
      return;
    }
  }, []);

  // ─── SVG OVERLAY RENDER ────────────────────────────────
  return (
    <svg
      id="connectivity-arcs-svg"
      className="connectivity-arcs-overlay"
      width="100%"
      height="100%"
      aria-hidden="true"
    />
  );
}

// ─── IMPERATIVE HELPERS (for external callers) ───────────
// These can be called from anywhere to fire pulses/arcs

export function triggerPulse(event: PulseEvent): void {
  window.dispatchEvent(
    new CustomEvent("nous:pulse", {
      detail: { event_type: event },
    })
  );
}

export function triggerArc(trigger: ArcTrigger): void {
  window.dispatchEvent(
    new CustomEvent("nous:arc", { detail: { trigger } })
  );
}
