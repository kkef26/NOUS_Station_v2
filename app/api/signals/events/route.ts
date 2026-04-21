import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getServiceClient();

  const { data: events } = await db
    .from("agent_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: levelEvents } = await db
    .from("level_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  // Per-level counts
  const { data: levelCounts } = await db
    .from("level_events")
    .select("level")
    .order("created_at", { ascending: false })
    .limit(200);

  const counts: Record<number, number> = {};
  for (const e of levelCounts || []) {
    counts[e.level] = (counts[e.level] || 0) + 1;
  }

  return NextResponse.json({
    events: events || [],
    level_events: levelEvents || [],
    level_counts: counts,
  });
}
