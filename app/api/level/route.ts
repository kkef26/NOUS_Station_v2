import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getNousUrl, getNousKey } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/level
 *
 * Computes NOUS intelligence level L1-L5 per NST.19.7 r3 doctrine.
 *
 * L1 Sparking   — default (first memories, one project)
 * L2 Networking — memory count >500 AND project count >3
 * L3 Anticipating — PM-agent drift-catches >0 in 7d
 * L4 Self-Correcting — auto-remediation events >0 in 7d
 * L5 Sovereign — 30d rolling yield ≥95% AND zero catastrophic drift
 *
 * Supports ?level=L3 debug param to force-set level.
 */
export async function GET(req: NextRequest) {
  // Debug override
  const debugLevel = req.nextUrl.searchParams.get("level");
  if (debugLevel) {
    const lvl = parseInt(debugLevel.replace("L", ""), 10);
    if (lvl >= 1 && lvl <= 5) {
      return NextResponse.json({
        level: lvl,
        label: LABELS[lvl],
        score: lvl * 20,
        thresholds_met: [`debug:forced-L${lvl}`],
        debug: true,
      });
    }
  }

  try {
    const db = getServiceClient();
    const nousUrl = getNousUrl();
    const nousKey = getNousKey();
    const thresholdsMet: string[] = [];

    // Fetch metrics in parallel
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const [memoryCount, projectCount, driftCatches, autoRemediation, yieldData] =
      await Promise.allSettled([
        // Memory count
        fetch(`${nousUrl}/recall?q=*&limit=1`, {
          headers: { "x-api-key": nousKey },
          signal: AbortSignal.timeout(5000),
        }).then(async (r) => {
          const d = await r.json();
          return d.count ?? d.memories?.length ?? 0;
        }),

        // Project count
        db
          .from("memories")
          .select("project", { count: "exact", head: true })
          .not("project", "is", null),

        // PM-agent drift catches in 7d
        db
          .from("agent_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "drift:catch")
          .gte("created_at", sevenDaysAgo),

        // Auto-remediation events in 7d
        db
          .from("agent_events")
          .select("id", { count: "exact", head: true })
          .in("event_type", ["auto:remediate", "rogue:auto-fix"])
          .gte("created_at", sevenDaysAgo),

        // 30d yield computation
        db
          .from("agent_events")
          .select("event_type", { count: "exact" })
          .gte("created_at", thirtyDaysAgo),
      ]);

    const memories = memoryCount.status === "fulfilled" ? memoryCount.value : 0;
    const projects = projectCount.status === "fulfilled" ? (projectCount.value.count ?? 0) : 0;
    const drifts = driftCatches.status === "fulfilled" ? (driftCatches.value.count ?? 0) : 0;
    const remediations = autoRemediation.status === "fulfilled" ? (autoRemediation.value.count ?? 0) : 0;

    // Compute yield
    let yield30d = 0;
    let catastrophicDrift = false;
    if (yieldData.status === "fulfilled") {
      const totalEvents = yieldData.value.count ?? 0;
      // Check for catastrophic drift events
      const { count: catastrophicCount } = await db
        .from("agent_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "drift:catastrophic")
        .gte("created_at", thirtyDaysAgo);

      catastrophicDrift = (catastrophicCount ?? 0) > 0;

      // Yield = successful completions / total dispatches
      const { count: completions } = await db
        .from("agent_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["complete", "worker:complete:success"])
        .gte("created_at", thirtyDaysAgo);

      const { count: dispatches } = await db
        .from("agent_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["dispatch:fire", "dispatch:claimed"])
        .gte("created_at", thirtyDaysAgo);

      const totalDispatches = dispatches ?? 1;
      yield30d = totalDispatches > 0
        ? ((completions ?? 0) / totalDispatches) * 100
        : 0;
    }

    // Evaluate levels bottom-up
    let level = 1;
    thresholdsMet.push("L1:sparking");

    if (memories > 500 && projects > 3) {
      level = 2;
      thresholdsMet.push(`L2:networking(memories=${memories},projects=${projects})`);
    }

    if (level >= 2 && drifts > 0) {
      level = 3;
      thresholdsMet.push(`L3:anticipating(drift_catches=${drifts})`);
    }

    if (level >= 3 && remediations > 0) {
      level = 4;
      thresholdsMet.push(`L4:self-correcting(auto_remediation=${remediations})`);
    }

    if (level >= 4 && yield30d >= 95 && !catastrophicDrift) {
      level = 5;
      thresholdsMet.push(`L5:sovereign(yield=${yield30d.toFixed(1)}%,catastrophic=false)`);
    }

    return NextResponse.json({
      level,
      label: LABELS[level],
      score: computeScore(level, memories, projects, drifts, remediations, yield30d),
      thresholds_met: thresholdsMet,
    });
  } catch (err) {
    console.error("[api/level]", err);
    return NextResponse.json({
      level: 1,
      label: "Sparking",
      score: 0,
      thresholds_met: ["L1:sparking", "error:computation-failed"],
    });
  }
}

const LABELS: Record<number, string> = {
  1: "Sparking",
  2: "Networking",
  3: "Anticipating",
  4: "Self-Correcting",
  5: "Sovereign",
};

function computeScore(
  level: number,
  memories: number,
  projects: number,
  drifts: number,
  remediations: number,
  yield30d: number
): number {
  // Composite score 0-100
  const memScore = Math.min(memories / 1000, 1) * 20;
  const projScore = Math.min(projects / 10, 1) * 15;
  const driftScore = Math.min(drifts / 5, 1) * 20;
  const remScore = Math.min(remediations / 5, 1) * 20;
  const yieldScore = (yield30d / 100) * 25;
  return Math.round(memScore + projScore + driftScore + remScore + yieldScore);
}
