"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function signalHueShift(queue: number, errorRate: number, staleWorkers: boolean): number {
  if (queue > 10 || errorRate > 15 || staleWorkers) return 20; // overloaded → rogue
  if (queue > 2 || errorRate > 5) return 10; // stressed → amber
  return 0; // calm → teal (180°)
}

export function PulseDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: workers } = useSWR("/api/pulse/workers", fetcher, { refreshInterval: 5000 });
  const { data: queue } = useSWR("/api/pulse/queue", fetcher, { refreshInterval: 5000 });
  const { data: signals } = useSWR("/api/signals/events", fetcher, { refreshInterval: 10000 });

  const workerList = workers?.workers || [];
  const workerCount = workerList.length || workers?.count || 0;
  const activeCount = workerList.filter?.((w: { status?: string }) => w.status === "active")?.length ?? workerCount;

  const pendingCount = queue?.pending ?? queue?.queue_depth ?? 0;
  const runningCount = queue?.running ?? queue?.active ?? 0;

  const errorRate = 0; // Would compute from friction stats
  const hueShift = signalHueShift(pendingCount, errorRate, false);
  const signalLabel = hueShift === 0 ? "Calm" : hueShift === 10 ? "Stressed" : "Overloaded";

  const recentLevels = (signals?.level_events || []).slice(0, 5);

  return (
    <div className="fixed inset-0 z-40 flex items-start" onClick={onClose}>
      <div className="scrim absolute inset-0" />
      <div
        className="relative w-full drawer-top-enter rounded-b-xl p-6 mt-14"
        style={{ background: "var(--bg-1)", maxHeight: "60vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--bg-2)" }} />
        <h3 className="text-sm font-medium mb-4" style={{ color: "var(--accent-teal)" }}>
          Pulse
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Fleet tile */}
          <button
            onClick={() => { onClose(); router.push("/fleet"); }}
            className="rounded-lg p-4 text-left hover:opacity-80 transition-opacity"
            style={{ background: "var(--bg-2)" }}
          >
            <div className="text-xs mb-1" style={{ color: "var(--ink-1)" }}>Fleet</div>
            <div className="text-lg font-medium" style={{ color: "var(--ink-0)" }}>
              {workerCount} workers
            </div>
            <div className="text-xs" style={{ color: "var(--accent-teal)" }}>
              {activeCount} active
            </div>
            {workerList.slice?.(0, 3).map((w: { id?: string; agent_id?: string }, i: number) => (
              <div key={i} className="text-xs mt-1 truncate" style={{ color: "var(--ink-1)" }}>
                {(w.id || w.agent_id || "").slice(0, 12)}...
              </div>
            ))}
          </button>

          {/* Queue tile */}
          <button
            onClick={() => { onClose(); router.push("/factory"); }}
            className="rounded-lg p-4 text-left hover:opacity-80 transition-opacity"
            style={{ background: "var(--bg-2)" }}
          >
            <div className="text-xs mb-1" style={{ color: "var(--ink-1)" }}>Queue</div>
            <div className="text-lg font-medium" style={{ color: "var(--ink-0)" }}>
              {pendingCount} pending
            </div>
            <div className="text-xs" style={{ color: "var(--accent-teal)" }}>
              {runningCount} running
            </div>
          </button>

          {/* Signals tile */}
          <button
            onClick={() => { onClose(); router.push("/signals"); }}
            className="rounded-lg p-4 text-left hover:opacity-80 transition-opacity"
            style={{
              background: "var(--bg-2)",
              ["--signal-hue-shift" as string]: `${hueShift}deg`,
            }}
          >
            <div className="text-xs mb-1" style={{ color: "var(--ink-1)" }}>Signals</div>
            <div
              className="text-lg font-medium"
              style={{
                color: hueShift === 0 ? "var(--accent-teal)" : hueShift === 10 ? "#f0c040" : "var(--rogue)",
              }}
            >
              {signalLabel}
            </div>
            <div className="flex gap-1 mt-2">
              {recentLevels.map((e: { id?: string; level: number; signal: string }, i: number) => (
                <span
                  key={e.id || i}
                  className="text-xs px-1.5 py-0.5 rounded breathing"
                  style={{
                    background: e.level === 1 ? "var(--accent-teal-dim)" : "var(--bg-1)",
                    color: "var(--ink-0)",
                  }}
                >
                  L{e.level}
                </span>
              ))}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
