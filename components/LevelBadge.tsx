"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LEVEL_LABELS, type LevelResult } from "@/lib/design-soul";

/**
 * LevelBadge — displays current NOUS intelligence level (L1-L5)
 * in the DeckShell header. Respects ?level=LX debug param.
 */
export function LevelBadge() {
  const searchParams = useSearchParams();
  const [levelData, setLevelData] = useState<LevelResult | null>(null);

  useEffect(() => {
    const debugLevel = searchParams.get("level");
    const url = debugLevel ? `/api/level?level=${debugLevel}` : "/api/level";

    fetch(url)
      .then((r) => r.json())
      .then((data: LevelResult) => setLevelData(data))
      .catch(() => {
        setLevelData({ level: 1, label: "Sparking", score: 0, thresholds_met: [] });
      });
  }, [searchParams]);

  if (!levelData) return null;

  const isHighLevel = levelData.level >= 4;

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs breathing"
      style={{
        background: isHighLevel ? "var(--accent-teal-dim)" : "var(--bg-2)",
        color: isHighLevel ? "var(--ink-0)" : "var(--ink-1)",
        border: levelData.level >= 5
          ? "1px solid rgba(184, 165, 76, 0.4)"
          : "1px solid transparent",
      }}
      title={`${levelData.label} — score ${levelData.score} — ${levelData.thresholds_met.join(", ")}`}
      data-level-gate="L5"
      data-testid="level-badge"
    >
      <span
        className="font-medium"
        style={{
          color: levelData.level >= 5
            ? "#b8a54c"
            : "var(--accent-teal)",
        }}
      >
        L{levelData.level}
      </span>
      <span>{LEVEL_LABELS[levelData.level] || "Unknown"}</span>
    </div>
  );
}
