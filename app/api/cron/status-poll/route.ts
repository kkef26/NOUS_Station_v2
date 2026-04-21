/**
 * /api/cron/status-poll — Provider statuspage polling cron route
 * Purpose: Poll all provider statuspages every 2min, detect outages, flip account status
 * Invocation: GET /api/cron/status-poll (Vercel cron or manual)
 * Inputs: none
 * Outputs: JSON { ok, providers_checked, incidents_new, accounts_flipped }
 * Error modes: partial_failure (some feeds fail, others succeed — still returns 200)
 * Blast radius: writes to nous.provider_status_feed + nous.accounts.status
 * Version: 1.0.0
 */
import { NextRequest } from "next/server";
import { pollProviderStatuses } from "@/lib/accounts/status-poller";

export async function GET(req: NextRequest) {
  // Verify cron secret if set (Vercel sends CRON_SECRET header)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const result = await pollProviderStatuses();

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
