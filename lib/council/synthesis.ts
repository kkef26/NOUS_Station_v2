import { getServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/llm";
import { DEFAULT_PERSONALITY } from "./fallback";

type SSEChunk =
  | { event: "token"; data: string }
  | { event: "done"; data: { turn_id: string; tokens_in: number; tokens_out: number; latency_ms: number } }
  | { event: "error"; data: { message: string } };

export async function runSynthesis(
  threadId: string,
  emit: (chunk: SSEChunk) => void
): Promise<{ synthesis_text: string; turn_id: string }> {
  const db = getServiceClient();

  const { data: thread } = await db
    .from("boardroom_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (!thread) throw new Error("Thread not found");

  // Load all turns
  const { data: turns } = await db
    .from("boardroom_seat_turns")
    .select("*")
    .eq("thread_id", threadId)
    .order("turn_index", { ascending: true });

  // Load chair personality
  const chairSlug = thread.chair_seat || "default";
  const { data: chairPersonality } = await db
    .from("personalities")
    .select("*")
    .eq("slug", chairSlug)
    .eq("active", true)
    .single();

  const chair = chairPersonality || DEFAULT_PERSONALITY;
  const provider = chair.default_provider || DEFAULT_PERSONALITY.default_provider;
  const model = chair.default_model || DEFAULT_PERSONALITY.default_model;

  // Build messages
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  messages.push({ role: "user", content: `Topic: ${thread.topic}` });

  for (const t of (turns || [])) {
    if (!t.silence && t.content) {
      messages.push({
        role: "assistant",
        content: `[${t.seat_personality}]: ${t.content}`,
      });
    }
  }

  const systemPrompt = `${chair.system_prompt}\n\nYou are the chair. Summarize the table's contributions in 3-5 bullets. Identify agreement, disagreement, and open questions. End with a Synthesis Statement (1-2 sentences). Do not speak as any individual seat.`;

  // Stream
  const llm = getProvider(provider as "anthropic" | "openai" | "google" | "xai");
  let fullContent = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;

  for await (const chunk of llm.stream({ messages, system: systemPrompt, model })) {
    if (chunk.type === "token") {
      fullContent += chunk.data;
      emit({ event: "token", data: chunk.data });
    } else if (chunk.type === "done") {
      tokensIn = chunk.data.tokens_in;
      tokensOut = chunk.data.tokens_out;
      latencyMs = chunk.data.latency_ms;
    } else if (chunk.type === "error") {
      emit({ event: "error", data: { message: chunk.data.message } });
      throw new Error(chunk.data.message);
    }
  }

  // Insert synthesis turn
  const turnCount = (turns || []).length;
  const { data: insertedTurn } = await db
    .from("boardroom_seat_turns")
    .insert({
      thread_id: threadId,
      seat_personality: chairSlug,
      seat_provider: "chair",
      turn_index: turnCount,
      content: fullContent,
      silence: false,
      provider,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  const turnId = insertedTurn?.id || "unknown";

  // Update thread
  await db
    .from("boardroom_threads")
    .update({ synthesis_message_id: turnId })
    .eq("id", threadId);

  emit({
    event: "done",
    data: { turn_id: turnId, tokens_in: tokensIn, tokens_out: tokensOut, latency_ms: latencyMs },
  });

  return { synthesis_text: fullContent, turn_id: turnId };
}
