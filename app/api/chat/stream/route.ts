import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { getServiceClient } from "@/lib/supabase/server";
import { getProvider, type ProviderName } from "@/lib/llm";
import { resolveAccount } from "@/lib/accounts/resolve";
import { DEFAULT_PERSONALITY } from "@/lib/council/fallback";
import { emitLevel } from "@/lib/levels/emit";

const StreamBody = z.object({
  thread_id: z.string().uuid().optional(),
  message: z.string().min(1),
  personality: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

const GATE_BLOCKED = (provider: string) =>
  new Response(
    JSON.stringify({
      error: "no_enabled_account",
      message: `No enabled ${provider} account. Open Settings → Accounts to configure one.`,
      link: "/settings/accounts",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = StreamBody.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, personality: personalitySlug, provider: providerOverride, model: modelOverride } = parsed.data;
  let threadId = parsed.data.thread_id;

  const db = getServiceClient();
  const workspaceId = req.cookies.get("workspace_id")?.value || null;

  // Resolve personality
  let personality = DEFAULT_PERSONALITY;
  if (personalitySlug) {
    const { data } = await db
      .from("personalities")
      .select("*")
      .eq("slug", personalitySlug)
      .eq("active", true)
      .single();
    if (data) personality = data;
  } else {
    const { data } = await db
      .from("personalities")
      .select("*")
      .eq("slug", "jarvis")
      .eq("active", true)
      .single();
    if (data) personality = data;
  }

  const providerName = (providerOverride || personality.default_provider) as ProviderName;
  const modelName = modelOverride || personality.default_model;

  // Gate: resolve account for the requested provider
  let resolved = await resolveAccount({ provider: providerName, purpose: "chat" });

  // Explicit fallback: if primary provider has no enabled account, try station_proxy
  if (!resolved.ok && providerName !== "station_proxy") {
    const proxyResolved = await resolveAccount({ provider: "station_proxy" });
    if (proxyResolved.ok) {
      resolved = proxyResolved;
    }
  }

  if (!resolved.ok) {
    return GATE_BLOCKED(providerName);
  }

  const credential = resolved.credential;
  const effectiveProvider = resolved.auth_type === "station_proxy" ? "station_proxy" : providerName;

  // Station proxy routing: forward entire request to the proxy
  if (effectiveProvider === "station_proxy") {
    const proxyUrl = process.env.STATION_PROXY_URL || "http://54.86.33.89:3001";
    try {
      const proxyResp = await fetch(`${proxyUrl}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-station-secret": process.env.STATION_PROXY_SHARED_SECRET || "",
        },
        body: JSON.stringify({ message, personality: personalitySlug, model: modelName }),
      });
      if (!proxyResp.ok || !proxyResp.body) {
        return GATE_BLOCKED("station_proxy");
      }
      return new Response(proxyResp.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          Connection: "keep-alive",
        },
      });
    } catch {
      return GATE_BLOCKED("station_proxy");
    }
  }

  const llm = getProvider(providerName, credential);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      function keepalive() {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }

      const heartbeat = setInterval(keepalive, 15000);

      try {
        if (!threadId) {
          const { data: newThread, error } = await db
            .from("chat_threads")
            .insert({ workspace_id: workspaceId })
            .select()
            .single();

          if (error || !newThread) {
            send("error", { message: "Failed to create thread", retryable: false });
            controller.close();
            clearInterval(heartbeat);
            return;
          }

          threadId = newThread.id;
          send("thread", { thread_id: threadId });
          emitLevel("thread_created", 1);
        }

        await db.from("chat_messages").insert({
          thread_id: threadId,
          workspace_id: workspaceId,
          role: "user",
          content: message,
          personality: personality.slug,
        });

        emitLevel("message_sent", 1);

        const { data: history } = await db
          .from("chat_messages")
          .select("role, content")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(20);

        const messages = (history || []).reverse().map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));

        let fullContent = "";
        let tokensIn = 0;
        let tokensOut = 0;
        let latencyMs = 0;

        for await (const chunk of llm.stream({
          messages,
          system: personality.system_prompt,
          model: modelName,
        })) {
          if (chunk.type === "token") {
            fullContent += chunk.data;
            send("token", chunk.data);
          } else if (chunk.type === "done") {
            tokensIn = chunk.data.tokens_in;
            tokensOut = chunk.data.tokens_out;
            latencyMs = chunk.data.latency_ms;
          } else if (chunk.type === "error") {
            send("error", { message: chunk.data.message, retryable: chunk.data.retryable });
            controller.close();
            clearInterval(heartbeat);
            return;
          }
        }

        const { data: assistantMsg } = await db
          .from("chat_messages")
          .insert({
            thread_id: threadId,
            workspace_id: workspaceId,
            role: "assistant",
            content: fullContent,
            provider: providerName,
            model: modelName,
            personality: personality.slug,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            latency_ms: latencyMs,
          })
          .select("id")
          .single();

        const { data: threadData } = await db
          .from("chat_threads")
          .select("title, message_count")
          .eq("id", threadId)
          .single();

        const newCount = (threadData?.message_count || 0) + 2;
        const updates: Record<string, unknown> = {
          message_count: newCount,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (!threadData?.title) {
          updates.title = message.slice(0, 60);
        }

        await db.from("chat_threads").update(updates).eq("id", threadId);

        send("done", {
          message_id: assistantMsg?.id || "unknown",
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          latency_ms: latencyMs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", { message: msg, retryable: false });
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
      Connection: "keep-alive",
    },
  });
}
