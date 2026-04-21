import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getServiceClient();
  const { id } = params;

  const { data: thread, error: threadErr } = await db
    .from("chat_threads")
    .select("*")
    .eq("id", id)
    .single();

  if (threadErr) return NextResponse.json({ error: threadErr.message }, { status: 404 });

  const { data: messages, error: msgErr } = await db
    .from("chat_messages")
    .select("*")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  return NextResponse.json({ thread, messages });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getServiceClient();
  const { id } = params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if ("title" in body) updates.title = body.title;
  if ("pinned" in body) updates.pinned = body.pinned;
  if ("archived" in body) updates.archived = body.archived;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("chat_threads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ thread: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getServiceClient();
  const { id } = params;

  const { error } = await db
    .from("chat_threads")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
