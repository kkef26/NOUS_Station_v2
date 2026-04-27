import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { getServiceClient } from "@/lib/supabase/server";
import { getProvider, type ProviderName } from "@/lib/llm";
import { resolveAccount, resolveChainCredential } from "@/lib/accounts/resolve";
import { streamWithChainRetry } from "@/lib/accounts/chain-retry";
import { DEFAULT_PERSONALITY } from "@/lib/council/fallback";
import { emitLevel } from "@/lib/levels/emit";

const StreamBody = z.object({
  thread_id: z.string().uuid().optional(),
  message: z.string().min(1),
  personality: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  strict: z.boolean().default(false),
});

const GATE_BLOCKED = (provider: string) =>
  new Response(
    JSON.stringify({
      error: "provider_not_configured",
      provider,
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

  const {
    message,
    personality: personalitySlug,
    provider: providerOverride,
    model: modelOverride,
    strict,
  } = parsed.data;
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

  // Determine the requested provider/model from override or personality defaults
  const requestedProvider = (providerOverride || personality.default_provider) as ProviderName;
  const requestedModel = modelOverride || personality.default_model;

  // Gate: resolve account with strict/soft mode
  const resolved = await resolveAccount({
    provider: requestedProvider === "station_proxy" ? "station_proxy" : requestedProvider,
    purpose: "chat",
    strict,
  });

  if (!resolved.ok) {
    return GATE_BLOCKED(requestedProvider);
  }

  const credential = resolved.credential;
  const effectiveProvider = resolved.auth_type === "station_proxy"
    ? "station_proxy"
    : (resolved.account.provider as ProviderName);

  // Determine what to pass to the provider's stream()
  // For station_proxy: we pass the originally-requested provider so the proxy routes correctly.
  // For direct providers: provider/provider_model are ignored by their stream() implementation.
  const targetProvider = requestedProvider === "station_proxy"
    ? (personality.default_provider || "anthropic")
    : requestedProvider;

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

        const streamInput = {
          messages,
          system: personality.system_prompt,
          model: requestedModel,
          // Extra fields used by StationProxyProvider, ignored by direct providers
          provider: targetProvider,
          provider_model: requestedModel,
          personality: personality.slug,
        };

        // Unified streaming path — station_proxy is now a proper LLMProvider
        const llmStream = resolved.fallback_chain.length > 0
          ? streamWithChainRetry({
              primary: resolved.account,
              primaryCredential: credential,
              fallbackChain: resolved.fallback_chain,
              streamInput,
              originalProvider: requestedProvider,
            })
          : getProvider(effectiveProvider, credential).stream(streamInput);

        for await (const chunk of llmStream) {
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
            provider: effectiveProvider,
            model: requestedModel,
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
