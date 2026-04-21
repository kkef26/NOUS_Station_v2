import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getServiceClient } from "@/lib/supabase/server";
import { routeBoardroomTopic } from "@/lib/council/agent";
import { emitLevel } from "@/lib/levels/emit";

const CreateBody = z.object({
  topic: z.string().min(1),
  pinned_seats: z.array(z.string()).optional(),
  chair: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { topic, pinned_seats, chair } = parsed.data;
  const workspaceId = req.cookies.get("workspace_id")?.value || null;

  // Route topic through Council Agent
  const result = await routeBoardroomTopic(topic, {
    pinnedSeats: pinned_seats,
    chair,
  });

  const db = getServiceClient();

  const { data: thread, error } = await db
    .from("boardroom_threads")
    .insert({
      workspace_id: workspaceId,
      topic,
      personalities_seated: result.seats.map((s) => s.personality),
      providers_seated: result.seats.map((s) => s.provider),
      turn_mode: result.turn_mode,
      chair_seat: result.chair,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  emitLevel("boardroom_opened", 1);

  return NextResponse.json({
    thread,
    seats: result.seats,
    turn_mode: result.turn_mode,
    chair: result.chair,
  });
}
