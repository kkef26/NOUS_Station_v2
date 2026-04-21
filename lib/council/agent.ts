import { getServiceClient } from "@/lib/supabase/server";
import { DEFAULT_PERSONALITY } from "./fallback";
import rules from "./rules.json";

interface Personality {
  slug: string;
  name: string;
  role: string;
  system_prompt: string;
  default_provider: string;
  default_model: string;
  color_accent: string | null;
  quirks: Record<string, unknown> | null;
  is_hybrid: boolean;
  hybrid_parents: string[] | null;
  active: boolean;
}

interface SeatInfo {
  personality: string;
  provider: string;
  model: string;
}

type TurnMode = "mention" | "round_robin" | "everyone" | "consensus" | "chair";

export async function routeBoardroomTopic(
  topic: string,
  opts?: {
    pinnedSeats?: string[];
    chair?: string;
    maxSeats?: number;
  }
): Promise<{
  seats: SeatInfo[];
  turn_mode: TurnMode;
  chair: string;
}> {
  const maxSeats = opts?.maxSeats || 5;
  const db = getServiceClient();

  // Load all active personalities
  const { data: personalities } = await db
    .from("personalities")
    .select("*")
    .eq("active", true);

  const allPersonalities: Personality[] = (personalities || []) as Personality[];

  // If no personalities synced, return fallback
  if (allPersonalities.length === 0) {
    return {
      seats: [
        {
          personality: "default",
          provider: DEFAULT_PERSONALITY.default_provider,
          model: DEFAULT_PERSONALITY.default_model,
        },
      ],
      turn_mode: "chair",
      chair: "default",
    };
  }

  const bySlug = new Map(allPersonalities.map((p) => [p.slug, p]));
  const seatSet = new Set<string>();

  // 1. Mentions: @slug in topic
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(topic)) !== null) {
    const slug = match[1].toLowerCase();
    if (bySlug.has(slug)) seatSet.add(slug);
  }

  // 2. Pinned seats
  if (opts?.pinnedSeats) {
    for (const slug of opts.pinnedSeats) {
      if (bySlug.has(slug)) seatSet.add(slug);
    }
  }

  // 3. Rules matching
  const topicLower = topic.toLowerCase();
  for (const [pattern, slugs] of Object.entries(rules)) {
    const keywords = pattern.split("|");
    if (keywords.some((kw) => topicLower.includes(kw))) {
      for (const slug of slugs) {
        if (bySlug.has(slug)) seatSet.add(slug);
      }
    }
  }

  // 4. Top-up if fewer than 3
  const defaults = ["strata", "sniper", "atlas"];
  if (seatSet.size < 3) {
    for (const slug of defaults) {
      if (bySlug.has(slug) && seatSet.size < 3) seatSet.add(slug);
    }
  }

  // 5. Chair
  let chairSlug = opts?.chair || "jarvis";
  if (!bySlug.has(chairSlug)) chairSlug = "default";
  seatSet.add(chairSlug);

  // 6. Cap at maxSeats
  const seatSlugs = Array.from(seatSet).slice(0, maxSeats);

  // 7. Resolve provider/model for each seat
  const seats: SeatInfo[] = seatSlugs.map((slug) => {
    if (slug === "default") {
      return {
        personality: "default",
        provider: DEFAULT_PERSONALITY.default_provider,
        model: DEFAULT_PERSONALITY.default_model,
      };
    }
    const p = bySlug.get(slug)!;
    return {
      personality: slug,
      provider: p.default_provider,
      model: p.default_model,
    };
  });

  return {
    seats,
    turn_mode: "round_robin",
    chair: chairSlug,
  };
}
