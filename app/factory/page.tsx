"use client";

import { DeckShell } from "@/components/DeckShell";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function FactoryPage() {
  const { data } = useSWR("/api/recall?q=schedule", fetcher);
  const items = data?.memories || [];

  return (
    <DeckShell surfaceLabel="Factory">
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-lg font-medium mb-4" style={{ color: "var(--ink-0)" }}>
          Factory
        </h1>

        {items.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: "var(--bg-1)" }}
          >
            <p className="text-sm" style={{ color: "var(--ink-1)" }}>
              No Factory items registered yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--bg-2)" }}>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--ink-1)" }}>
                    Name
                  </th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--ink-1)" }}>
                    Cadence
                  </th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--ink-1)" }}>
                    Last Run
                  </th>
                  <th className="text-left py-2 px-3 font-medium" style={{ color: "var(--ink-1)" }}>
                    Next Run
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: { id?: string; content: string; memory_type?: string; created_at?: string }, i: number) => (
                  <tr
                    key={item.id || i}
                    style={{ borderBottom: "1px solid var(--bg-2)" }}
                  >
                    <td className="py-2 px-3" style={{ color: "var(--ink-0)" }}>
                      {item.content?.slice(0, 50) || "Unknown"}
                    </td>
                    <td className="py-2 px-3" style={{ color: "var(--ink-1)" }}>
                      {item.memory_type || "-"}
                    </td>
                    <td className="py-2 px-3" style={{ color: "var(--ink-1)" }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "-"}
                    </td>
                    <td className="py-2 px-3" style={{ color: "var(--ink-1)" }}>-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DeckShell>
  );
}
