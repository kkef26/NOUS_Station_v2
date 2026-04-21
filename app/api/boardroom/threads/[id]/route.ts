import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getServiceClient();

  const { data: thread, error: threadErr } = await db
    .from("boardroom_threads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 404 });

  const { data: turns } = await db
    .from("boardroom_seat_turns")
    .select("*")
    .eq("thread_id", params.id)
    .order("turn_index", { ascending: true });

  return NextResponse.json({ thread, turns: turns || [] });
}
