import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServiceClient } from "@/lib/supabase/server";

const HandoffBody = z.object({
  mode: z.enum(["attach", "reference", "mint"]),
  target_thread_id: z.string().uuid().optional(),
  artifact_type: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => null);
  const parsed = HandoffBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { mode, target_thread_id } = parsed.data;
  const db = getServiceClient();

  // Load synthesis
  const { data: thread } = await db
    .from("boardroom_threads")
    .select("synthesis_message_id, topic")
    .eq("id", params.id)
    .single();

  if (!thread?.synthesis_message_id) {
    return NextResponse.json({ error: "No synthesis found for this thread" }, { status: 400 });
  }

  // Load synthesis turn content
  const { data: synthesisTurn } = await db
    .from("boardroom_seat_turns")
    .select("content")
    .eq("id", thread.synthesis_message_id)
    .single();

  const synthesisText = synthesisTurn?.content || "";

  switch (mode) {
    case "attach": {
      let chatThreadId = target_thread_id;

      // Create chat thread if none specified
      if (!chatThreadId) {
        const { data: newThread } = await db
          .from("chat_threads")
          .insert({ title: `Boardroom: ${thread.topic?.slice(0, 50)}` })
          .select("id")
          .single();
        chatThreadId = newThread?.id;
      }

      if (!chatThreadId) {
        return NextResponse.json({ error: "Failed to create target thread" }, { status: 500 });
      }

      // Insert synthesis as chat message
      await db.from("chat_messages").insert({
        thread_id: chatThreadId,
        role: "assistant",
        content: `${synthesisText}\n\n---\n*Source: boardroom/${params.id}*`,
        personality: "chair",
      });

      // Update thread message count
      const { data: threadData } = await db
        .from("chat_threads")
        .select("message_count")
        .eq("id", chatThreadId)
        .single();

      await db
        .from("chat_threads")
        .update({
          message_count: (threadData?.message_count || 0) + 1,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatThreadId);

      return NextResponse.json({ ok: true, thread_id: chatThreadId });
    }

    case "reference":
      return NextResponse.json({ url: `boardroom://${params.id}` });

    case "mint":
      return NextResponse.json({ toast: "Minting arrives in Bite 3" });
  }
}
