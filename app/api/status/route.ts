import { NextResponse } from "next/server";
import { getNousUrl, getNousKey } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/status
 *
 * Returns system state metrics for color temperature computation.
 * Proxies to NOUS /status endpoint and aggregates queue + fleet data.
 * Polled every 30s by DesignSoulProvider.
 */
export async function GET() {
  try {
    const nousUrl = getNousUrl();
    const nousKey = getNousKey();

    // Fetch queue depth and worker status in parallel
    const [queueRes, workersRes] = await Promise.allSettled([
      fetch(`${nousUrl}/dispatch/queue`, {
        headers: { "x-api-key": nousKey },
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${nousUrl}/dispatch/workers`, {
        headers: { "x-api-key": nousKey },
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    let queueDepth = 0;
    let activeWorkers = 0;
    let errorRate = 0;

    if (queueRes.status === "fulfilled" && queueRes.value.ok) {
      const qData = await queueRes.value.json();
      queueDepth = qData.pending ?? qData.queue_depth ?? 0;
    }

    if (workersRes.status === "fulfilled" && workersRes.value.ok) {
      const wData = await workersRes.value.json();
      const workers = wData.workers || [];
      activeWorkers = workers.filter(
        (w: { status?: string }) => w.status === "active"
      ).length;
      // Compute error rate from recent worker failures
      const total = workers.length || 1;
      const failed = workers.filter(
        (w: { status?: string }) => w.status === "failed"
      ).length;
      errorRate = (failed / total) * 100;
    }

    return NextResponse.json({
      queue_depth: queueDepth,
      active_workers: activeWorkers,
      error_rate: Math.round(errorRate * 10) / 10,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Return calm state on any failure — don't shift color on infra errors
    return NextResponse.json({
      queue_depth: 0,
      active_workers: 0,
      error_rate: 0,
      timestamp: new Date().toISOString(),
    });
  }
}
