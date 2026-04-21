"use client";

import { DeckShell } from "@/components/DeckShell";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SignalsPage() {
  const { data: signalsData } = useSWR("/api/signals/events", fetcher, { refreshInterval: 10000 });

  const events = signalsData?.events || [];
  const levelEvents = signalsData?.level_events || [];
  const levelCounts = signalsData?.level_counts || {};

  return (
    <DeckShell surfaceLabel="Signals">
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-lg font-medium mb-4" style={{ color: "var(--ink-0)" }}>
          Signals
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Friction panel */}
          <div className="rounded-lg p-4" style={{ background: "var(--bg-1)" }}>
            <h3 className="text-xs font-medium mb-3" style={{ color: "var(--ink-1)" }}>
              Friction
            </h3>
            {events.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-1)" }}>
                No friction events.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {events.slice(0, 15).map((e: { id?: string; event_type?: string; summary?: string; created_at?: string }, i: number) => (
                  <div
                    key={e.id || i}
                    className="text-xs rounded p-2"
                    style={{ background: "var(--bg-2)" }}
                  >
                    <div className="font-medium" style={{ color: "var(--ink-0)" }}>
                      {e.event_type || "event"}
                    </div>
                    <div className="truncate" style={{ color: "var(--ink-1)" }}>
                      {e.summary || ""}
                    </div>
                    <div style={{ color: "var(--ink-1)" }}>
                      {e.created_at ? new Date(e.created_at).toLocaleTimeString() : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events panel */}
          <div className="rounded-lg p-4" style={{ background: "var(--bg-1)" }}>
            <h3 className="text-xs font-medium mb-3" style={{ color: "var(--ink-1)" }}>
              Agent Events
            </h3>
            {events.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-1)" }}>
                No agent events.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {events.slice(0, 15).map((e: { id?: string; event_type?: string; agent_id?: string; summary?: string; created_at?: string }, i: number) => (
                  <div
                    key={e.id || i}
                    className="text-xs rounded p-2"
                    style={{ background: "var(--bg-2)" }}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium" style={{ color: "var(--ink-0)" }}>
                        {e.event_type || "event"}
                      </span>
                      <span style={{ color: "var(--ink-1)" }}>
                        {e.agent_id?.slice(0, 12) || ""}
                      </span>
                    </div>
                    <div className="truncate" style={{ color: "var(--ink-1)" }}>
                      {e.summary || ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Levels panel */}
          <div className="rounded-lg p-4" style={{ background: "var(--bg-1)" }}>
            <h3 className="text-xs font-medium mb-3" style={{ color: "var(--ink-1)" }}>
              Level Events
            </h3>

            {/* Level counts */}
            <div className="flex gap-2 mb-3">
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  key={level}
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    background: levelCounts[level] ? "var(--accent-teal-dim)" : "var(--bg-2)",
                    color: "var(--ink-0)",
                  }}
                >
                  L{level}: {levelCounts[level] || 0}
                </div>
              ))}
            </div>

            {levelEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-1)" }}>
                No level events yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {levelEvents.slice(0, 15).map((e: { id?: string; level: number; signal: string; created_at?: string }, i: number) => (
                  <div
                    key={e.id || i}
                    className="text-xs rounded p-2 flex justify-between"
                    style={{ background: "var(--bg-2)" }}
                  >
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{
                        background: e.level <= 2 ? "var(--accent-teal-dim)" : "var(--bg-1)",
                        color: "var(--ink-0)",
                      }}
                    >
                      L{e.level}
                    </span>
                    <span style={{ color: "var(--ink-0)" }}>{e.signal}</span>
                    <span style={{ color: "var(--ink-1)" }}>
                      {e.created_at ? new Date(e.created_at).toLocaleTimeString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DeckShell>
  );
}
