import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getNousUrl, getNousKey } from "@/lib/supabase/server";
import { emitLevel } from "@/lib/levels/emit";

const SUPABASE_URL = "https://oozlawunlkkuaykfunan.supabase.co";

const DispatchBody = z.object({
  prompt: z.string().min(1),
  project: z.string().min(1),
  brain_tag: z.string().min(1),
  priority: z.string().optional(),
  tier: z.string().optional(),
  bible_clause: z.string().min(1),
  reasoning: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = DispatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { prompt, project, brain_tag, priority, tier, bible_clause, reasoning } = parsed.data;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_NOUS;
  if (!serviceRole) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_NOUS not set", stage: "config" }, { status: 500 });
  }

  // Step 1: Insert triage_entry
  let triageId: string;
  try {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const triageResp = await fetch(`${SUPABASE_URL}/rest/v1/triage_entries`, {
      method: "POST",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Profile": "nous",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        bible_clauses_cited: [bible_clause],
        clauses_verified_in_ledger: [bible_clause],
        verdict: "approved",
        reasoning: reasoning || "Dispatched from Station UI",
        effort_estimate_min: 60,
        blast_radius_score: 2,
        expires_at: expiresAt,
      }),
    });

    if (!triageResp.ok) {
      const text = await triageResp.text();
      return NextResponse.json({ error: text, stage: "triage" }, { status: 500 });
    }

    const triageData = await triageResp.json();
    triageId = Array.isArray(triageData) ? triageData[0].id : triageData.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, stage: "triage" }, { status: 500 });
  }

  // Step 2: Call NOUS dispatch
  try {
    const nousUrl = getNousUrl();
    const nousKey = getNousKey();

    const dispatchResp = await fetch(`${nousUrl}/dispatch`, {
      method: "POST",
      headers: {
        "x-api-key": nousKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        project,
        brain_tag,
        priority: priority || "normal",
        tier: tier || "c2",
        triage_id: triageId,
      }),
    });

    const dispatchData = await dispatchResp.json();

    emitLevel("dispatch_fired", 2, { dispatch_id: dispatchData.dispatch_id || triageId });

    return NextResponse.json({
      dispatch_id: dispatchData.dispatch_id || dispatchData.id,
      triage_id: triageId,
      status: dispatchData.status || "dispatched",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, stage: "dispatch" }, { status: 500 });
  }
}
