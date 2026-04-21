import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { emitLevel } from "@/lib/levels/emit";

export async function GET(req: NextRequest) {
  const db = getServiceClient();
  const workspaceId = req.cookies.get("workspace_id")?.value || null;

  const query = db
    .from("chat_threads")
    .select("*")
    .eq("archived", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (workspaceId) query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ threads: data });
}

export async function POST(req: NextRequest) {
  const db = getServiceClient();
  const workspaceId = req.cookies.get("workspace_id")?.value || null;

  let body: { title?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const { data, error } = await db
    .from("chat_threads")
    .insert({
      workspace_id: workspaceId,
      title: body.title || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  emitLevel("thread_created", 1);

  return NextResponse.json({ thread: data });
}
