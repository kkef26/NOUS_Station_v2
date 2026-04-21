import { NextRequest } from "next/server";
import { runSynthesis } from "@/lib/council/synthesis";
import { emitLevel } from "@/lib/levels/emit";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);

      try {
        const result = await runSynthesis(params.id, (chunk) =>
          send(chunk.event, chunk.data)
        );

        emitLevel("synthesis_generated", 2, { thread_id: params.id });

        // Also return JSON at end for non-streaming consumers
        send("synthesis", { synthesis_text: result.synthesis_text, turn_id: result.turn_id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", { message: msg });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
