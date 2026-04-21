import { getServiceClient } from "@/lib/supabase/server";

export async function emitLevel(
  signal: string,
  level: 1 | 2,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getServiceClient();
    await db.from("level_events").insert({
      level,
      signal,
      context: context || null,
    });
  } catch (err) {
    // Level telemetry is best-effort; do not block the caller
    console.error("[level-emit]", signal, err);
  }
}
