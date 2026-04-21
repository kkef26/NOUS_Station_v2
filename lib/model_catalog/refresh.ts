/**
 * refresh.ts — Model catalog refresh stub
 * Purpose: Seam for future cron-based model catalog refresh from provider APIs.
 * The actual polling logic (Anthropic list-models, OpenAI models endpoint, RSS feeds)
 * will land in a follow-up bite. This stub provides the contract and wired-up route.
 * Version: 1.0.0 (stub)
 */

export async function refreshModelCatalog(
  _provider?: string
): Promise<{ added: number; deprecated: number }> {
  // No-op stub — actual provider polling lands in a follow-up bite.
  return { added: 0, deprecated: 0 };
}
