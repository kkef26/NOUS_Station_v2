import { getServiceClient } from "@/lib/supabase/server";
import { getProvider, type Chunk, type ProviderName } from "@/lib/llm";
import { resolveAccount } from "@/lib/accounts/resolve";
import { streamWithChainRetry } from "@/lib/accounts/chain-retry";
import { DEFAULT_PERSONALITY } from "./fallback";

type SSEChunk =
  | { event: "token"; data: string }
  | { event: "done"; data: { turn_id: string; tokens_in: number; tokens_out: number; latency_ms: number } }
  | { event: "silence"; data: { seat: string } }
  | { event: "error"; data: { message: string } };

interface Turn {
  seat_personality: string;
  content: string | null;
  silence: boolean;
  turn_index: number;
}

export async function runTurn(
  threadId: string,
  opts: { force_seat?: string; emit: (chunk: SSEChunk) => void }
): Promise<{ turn_id: string; silent: boolean }> {
  const db = getServiceClient();

  const { data: thread } = await db
    .from("boardroom_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (!thread) throw new Error("Thread not found");

  const { data: priorTurns } = await db
    .from("boardroom_seat_turns")
    .select("*")
    .eq("thread_id", threadId)
    .order("turn_index", { ascending: true });

  const turns: Turn[] = (priorTurns || []) as Turn[];
  const seatedPersonalities: string[] = thread.personalities_seated || [];
  const turnMode: string = thread.turn_mode || "round_robin";

  let nextSeat: string;
  if (opts.force_seat) {
    nextSeat = opts.force_seat;
  } else {
    nextSeat = pickNextSeat(turns, seatedPersonalities, turnMode, thread.topic, thread.chair_seat);
  }

  const { data: personality } = await db
    .from("personalities")
    .select("*")
    .eq("slug", nextSeat)
    .eq("active", true)
    .single();

  const p = personality || DEFAULT_PERSONALITY;
  const requestedProvider = (p.default_provider || DEFAULT_PERSONALITY.default_provider) as ProviderName;
  const model = p.default_model || DEFAULT_PERSONALITY.default_model;

  // Gate: resolve account — soft mode for boardroom (ambient, should soft-handover)
  const resolved = await resolveAccount({ provider: requestedProvider, purpose: "chat", strict: false });
  if (!resolved.ok) {
    opts.emit({ event: "error", data: { message: `No enabled account available. Open Settings → Accounts.` } });
    throw new Error("no_enabled_account");
  }

  const effectiveProvider = resolved.auth_type === "station_proxy"
    ? "station_proxy"
    : (resolved.account.provider as ProviderName);

  // For station_proxy: pass the personality's requested provider so proxy routes correctly
  const targetProvider = effectiveProvider === "station_proxy"
    ? (requestedProvider === "station_proxy" ? (p.default_provider || "anthropic") : requestedProvider)
    : requestedProvider;

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  messages.push({ role: "user", content: `Topic: ${thread.topic}` });

  for (const t of turns) {
    if (!t.silence && t.content) {
      messages.push({
        role: "assistant",
        content: `[${t.seat_personality}]: ${t.content}`,
      });
    }
  }

  const systemPrompt = `${p.system_prompt}\n\nBoardroom context: topic="${thread.topic}". Turn mode: ${turnMode}. Speak as ${p.name}. If you have nothing meaningful to add, respond with exactly [SILENCE] and nothing else.`;

  const streamInput = {
    messages,
    system: systemPrompt,
    model,
    // Extra fields for StationProxyProvider — ignored by direct providers
    provider: targetProvider,
    provider_model: model,
    personality: p.slug,
  };

  // Unified streaming — station_proxy is now a proper LLMProvider in getProvider()
  const llmStream = resolved.fallback_chain.length > 0
    ? streamWithChainRetry({
        primary: resolved.account,
        primaryCredential: resolved.credential,
        fallbackChain: resolved.fallback_chain,
        streamInput,
        originalProvider: requestedProvider,
      })
    : getProvider(effectiveProvider, resolved.credential).stream(streamInput);

  let fullContent = "";
  let silent = false;
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;

  try {
    for await (const chunk of llmStream) {
      if (chunk.type === "token") {
        fullContent += chunk.data;
        if (!silent && fullContent.trim().startsWith("[SILENCE]")) {
          silent = true;
          opts.emit({ event: "silence", data: { seat: nextSeat } });
        } else if (!silent) {
          opts.emit({ event: "token", data: chunk.data });
        }
      } else if (chunk.type === "done") {
        tokensIn = chunk.data.tokens_in;
        tokensOut = chunk.data.tokens_out;
        latencyMs = chunk.data.latency_ms;
      } else if (chunk.type === "error") {
        opts.emit({ event: "error", data: { message: chunk.data.message } });
        throw new Error(chunk.data.message);
      }
    }
  } catch (err) {
    if (!silent) {
      const msg = err instanceof Error ? err.message : String(err);
      opts.emit({ event: "error", data: { message: msg } });
    }
  }

  const turnIndex = turns.length;
  const { data: insertedTurn } = await db
    .from("boardroom_seat_turns")
    .insert({
      thread_id: threadId,
      seat_personality: nextSeat,
      seat_provider: effectiveProvider,
      turn_index: turnIndex,
      content: silent ? "" : fullContent,
      silence: silent,
      provider: effectiveProvider,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latency_ms: latencyMs,
    })
    .select("id")
    .single();

  const turnId = insertedTurn?.id || "unknown";

  if (!silent) {
    opts.emit({
      event: "done",
      data: { turn_id: turnId, tokens_in: tokensIn, tokens_out: tokensOut, latency_ms: latencyMs },
    });
  }

  return { turn_id: turnId, silent };
}

function pickNextSeat(
  turns: Turn[],
  seats: string[],
  turnMode: string,
  topic: string,
  chairSeat?: string
): string {
  if (seats.length === 0) return "default";

  switch (turnMode) {
    case "round_robin": {
      if (turns.length === 0) return seats[0];
      const lastSeat = turns[turns.length - 1].seat_personality;
      const idx = seats.indexOf(lastSeat);
      return seats[(idx + 1) % seats.length];
    }
    case "mention": {
      const lastContent = turns.length > 0 ? turns[turns.length - 1].content || topic : topic;
      const mentionRegex = /@(\w+)/g;
      let match;
      while ((match = mentionRegex.exec(lastContent)) !== null) {
        const slug = match[1].toLowerCase();
        if (seats.includes(slug)) return slug;
      }
      return pickNextSeat(turns, seats, "round_robin", topic, chairSeat);
    }
    case "everyone": {
      const spoken = new Set(turns.map((t) => t.seat_personality));
      for (const seat of seats) {
        if (!spoken.has(seat)) return seat;
      }
      return seats[0];
    }
    case "consensus":
      return pickNextSeat(turns, seats, "round_robin", topic, chairSeat);
    case "chair":
      return chairSeat || seats[0];
    default:
      return seats[0];
  }
}
