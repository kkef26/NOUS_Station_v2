/**
 * Design Soul Engine — NST.19.7 r3 Bite 2.8
 *
 * Living-system mechanics:
 * 1. Signal-driven pulses on real NOUS events
 * 2. System-state color temperature (4 buckets)
 * 3. Connectivity arcs (SVG overlay)
 * 4. Level computation + visual gating
 */

// ─── PULSE WIRING ───────────────────────────────────────
// Maps NOUS event types to DOM targets + pulse animations.
// Each event fires a CSS data-pulse attribute on the target.

export type PulseEvent =
  | "dispatch:fire"
  | "worker:complete:success"
  | "clause:ship"
  | "rogue:trip";

const PULSE_MAP: Record<
  PulseEvent,
  { selector: string; attr: string; durationMs: number }
> = {
  "dispatch:fire": {
    selector: "[data-soul-target='queue-cell']",
    attr: "dispatch-fire",
    durationMs: 400,
  },
  "worker:complete:success": {
    selector: "[data-soul-target='chair']",
    attr: "worker-complete",
    durationMs: 600,
  },
  "clause:ship": {
    selector: "[data-soul-target='rail-chip']",
    attr: "clause-ship",
    durationMs: 500,
  },
  "rogue:trip": {
    selector: "main",
    attr: "rogue-trip",
    durationMs: 2000,
  },
};

export function firePulse(event: PulseEvent): void {
  const spec = PULSE_MAP[event];
  if (!spec) return;

  const el = document.querySelector(spec.selector);
  if (!el) return;

  // Remove any existing pulse, force reflow, then apply
  el.removeAttribute("data-pulse");
  void (el as HTMLElement).offsetWidth; // force reflow
  el.setAttribute("data-pulse", spec.attr);

  setTimeout(() => {
    el.removeAttribute("data-pulse");
  }, spec.durationMs + 50);
}

// ─── SYSTEM-STATE COLOR TEMPERATURE ─────────────────────
// 4 buckets: calm | working | stressed | overloaded
// Maps to --bg-temp-hue CSS var (≤10° total swing)

export type SystemState = "calm" | "working" | "stressed" | "overloaded";

const STATE_CONFIG: Record<SystemState, { hue: number; saturate: number }> = {
  calm: { hue: 0, saturate: 1 },
  working: { hue: 2, saturate: 1 },
  stressed: { hue: 6, saturate: 0.95 },
  overloaded: { hue: 10, saturate: 0.88 },
};

export function computeSystemState(
  queueDepth: number,
  errorRate: number,
  activeWorkers: number
): SystemState {
  if (queueDepth > 10 || errorRate > 15) return "overloaded";
  if (queueDepth > 5 || errorRate > 5) return "stressed";
  if (activeWorkers > 0 || queueDepth > 0) return "working";
  return "calm";
}

export function applyColorTemperature(state: SystemState): void {
  const config = STATE_CONFIG[state];
  const root = document.documentElement;
  root.style.setProperty("--bg-temp-hue", `${config.hue}deg`);
  root.style.setProperty("--bg-temp-saturate", `${config.saturate}`);
}

// ─── CONNECTIVITY ARCS ──────────────────────────────────
// SVG overlay with ≤3 concurrent arcs, ≤1px stroke,
// opacity 0.15 → 0 fade over 30s.

export type ArcTrigger =
  | "memory-clause-attach"
  | "signal-project-bind"
  | "dispatch-memory-write";

interface ActiveArc {
  id: string;
  fromEl: string;
  toEl: string;
  startTime: number;
}

const MAX_ARCS = 3;
const ARC_FADE_MS = 30_000;

let activeArcs: ActiveArc[] = [];
let arcIdCounter = 0;

function getAnchorCenter(selector: string): { x: number; y: number } | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

const ARC_ANCHORS: Record<ArcTrigger, { from: string; to: string }> = {
  "memory-clause-attach": {
    from: "[data-soul-anchor='memory']",
    to: "[data-soul-anchor='clause']",
  },
  "signal-project-bind": {
    from: "[data-soul-anchor='signal']",
    to: "[data-soul-anchor='project']",
  },
  "dispatch-memory-write": {
    from: "[data-soul-anchor='dispatch']",
    to: "[data-soul-anchor='memory']",
  },
};

export function spawnArc(trigger: ArcTrigger): string | null {
  const svg = document.getElementById("connectivity-arcs-svg");
  if (!svg) return null;

  const anchors = ARC_ANCHORS[trigger];
  const from = getAnchorCenter(anchors.from);
  const to = getAnchorCenter(anchors.to);

  // If anchors aren't in DOM, use fallback positions
  const fromPt = from || { x: window.innerWidth * 0.2, y: window.innerHeight * 0.5 };
  const toPt = to || { x: window.innerWidth * 0.8, y: window.innerHeight * 0.3 };

  // Enforce max concurrent arcs — remove oldest
  if (activeArcs.length >= MAX_ARCS) {
    const oldest = activeArcs.shift()!;
    const oldPath = document.getElementById(oldest.id);
    if (oldPath) oldPath.remove();
  }

  const id = `arc-${++arcIdCounter}`;
  const arc: ActiveArc = {
    id,
    fromEl: anchors.from,
    toEl: anchors.to,
    startTime: Date.now(),
  };
  activeArcs.push(arc);

  // Create SVG path — quadratic bezier
  const mx = (fromPt.x + toPt.x) / 2;
  const my = Math.min(fromPt.y, toPt.y) - 60;
  const d = `M ${fromPt.x} ${fromPt.y} Q ${mx} ${my} ${toPt.x} ${toPt.y}`;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("id", id);
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "var(--accent-teal)");
  path.setAttribute("stroke-width", "0.8");
  path.setAttribute("opacity", "0.15");
  path.style.transition = `opacity ${ARC_FADE_MS}ms linear`;
  svg.appendChild(path);

  // Start fade immediately
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      path.setAttribute("opacity", "0");
    });
  });

  // Remove from DOM after fade
  setTimeout(() => {
    path.remove();
    activeArcs = activeArcs.filter((a) => a.id !== id);
  }, ARC_FADE_MS + 500);

  return id;
}

// ─── LEVEL COMPUTATION ──────────────────────────────────
// L1-L5 thresholds per NST.19.7 r3 doctrine

export interface LevelResult {
  level: number;
  label: string;
  score: number;
  thresholds_met: string[];
}

export const LEVEL_LABELS: Record<number, string> = {
  1: "Sparking",
  2: "Networking",
  3: "Anticipating",
  4: "Self-Correcting",
  5: "Sovereign",
};

export const LEVEL_ARC_CAPS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 6,
  4: 10,
  5: Infinity,
};

export function applyLevelGating(level: number): void {
  const root = document.documentElement;

  // Arc cap
  root.style.setProperty("--level-arc-cap", `${LEVEL_ARC_CAPS[level] || 1}`);

  // L5 gold overtone
  root.style.setProperty("--level-gold-overtone", level >= 5 ? "1" : "0");

  // L3 unlocks Signals drawer deep view
  document.querySelectorAll("[data-level-gate='L3']").forEach((el) => {
    (el as HTMLElement).style.display = level >= 3 ? "" : "none";
  });

  // L4 unlocks Sentinel rail
  document.querySelectorAll("[data-level-gate='L4']").forEach((el) => {
    (el as HTMLElement).style.display = level >= 4 ? "" : "none";
  });

  // L5 subtle ivory/gold overtones
  document.querySelectorAll("[data-level-gate='L5']").forEach((el) => {
    (el as HTMLElement).style.display = level >= 5 ? "" : "none";
  });
}

// ─── EVENT STREAM LISTENER ──────────────────────────────
// Listens for NOUS events and fires the appropriate pulse

export function handleNousEvent(event: {
  event_type: string;
  [key: string]: unknown;
}): void {
  switch (event.event_type) {
    case "dispatch:fire":
      firePulse("dispatch:fire");
      break;
    case "worker:complete:success":
    case "complete":
      firePulse("worker:complete:success");
      break;
    case "clause:ship":
      firePulse("clause:ship");
      break;
    case "rogue:trip":
      firePulse("rogue:trip");
      break;
  }
}
