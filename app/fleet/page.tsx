"use client";

import { useState } from "react";
import { DeckShell } from "@/components/DeckShell";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FleetPage() {
  const { data } = useSWR("/api/pulse/workers", fetcher, { refreshInterval: 5000 });
  const workers = data?.workers || [];
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <DeckShell surfaceLabel="Fleet">
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-lg font-medium mb-4" style={{ color: "var(--ink-0)" }}>
          Fleet
        </h1>

        {workers.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: "var(--bg-1)" }}
          >
            <p className="text-sm" style={{ color: "var(--ink-1)" }}>
              No active workers.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workers.map((w: { id?: string; agent_id?: string; status?: string; project?: string; started_at?: string }, i: number) => {
              const wId = w.id || w.agent_id || `worker-${i}`;
              const isExpanded = expanded === wId;

              return (
                <div
                  key={wId}
                  className="rounded-lg overflow-hidden"
                  style={{ background: "var(--bg-1)" }}
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : wId)}
                    className="w-full text-left px-4 py-3 flex justify-between items-center hover:opacity-80"
                  >
                    <div>
                      <span className="text-sm font-mono" style={{ color: "var(--ink-0)" }}>
                        {wId.slice(0, 24)}
                      </span>
                      <span
                        className="ml-2 text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: w.status === "active" ? "var(--accent-teal-dim)" : "var(--bg-2)",
                          color: "var(--ink-0)",
                        }}
                      >
                        {w.status || "unknown"}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: "var(--ink-1)" }}>
                      {w.project || ""}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 border-t" style={{ borderColor: "var(--bg-2)" }}>
                      <div className="text-xs py-2" style={{ color: "var(--ink-1)" }}>
                        Started: {w.started_at ? new Date(w.started_at).toLocaleString() : "unknown"}
                      </div>
                      <div className="text-xs py-2" style={{ color: "var(--ink-1)" }}>
                        Logs integration arrives in Bite 3
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DeckShell>
  );
}
