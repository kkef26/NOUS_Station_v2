import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/pulse/events
 *
 * SSE endpoint for the PULSE-1 channel.
 * Streams NOUS agent events in real-time for pulse wiring.
 * Falls back to polling if Supabase realtime is unavailable.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 15000);

      // Poll for recent events every 2s and emit new ones
      let lastSeen = new Date().toISOString();
      const db = getServiceClient();

      const poll = setInterval(async () => {
        if (closed) {
          clearInterval(poll);
          return;
        }

        try {
          const { data: events } = await db
            .from("agent_events")
            .select("*")
            .gt("created_at", lastSeen)
            .order("created_at", { ascending: true })
            .limit(10);

          if (events && events.length > 0) {
            for (const event of events) {
              const payload = `event: PULSE-1\ndata: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(payload));
              lastSeen = event.created_at;
            }
          }
        } catch {
          // polling failure — ignore, retry on next tick
        }
      }, 2000);

      // Clean up after 5 minutes (client will reconnect)
      setTimeout(() => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(poll);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, 5 * 60 * 1000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
