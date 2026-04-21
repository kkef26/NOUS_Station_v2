/**
 * resolve.ts — Account resolver chokepoint with tier-matched fallback chain
 * Purpose: Every LLM call must pass through resolveAccount() — selects best account,
 *   builds fallback chain for soft-handover, enforces strict mode.
 * Invocation: resolveAccount({ provider?, tier?, strict?, purpose?, exclude_account_ids? })
 * Inputs: ResolveInput (see type below)
 * Outputs: ResolveResult — ok + account + fallback_chain, or error with reason
 * Error modes: strict_no_match (strict mode, no account), chain_exhausted (soft mode, all down),
 *   no_enabled_account (legacy compat), db_error (logged)
 * Blast radius: every LLM call path in the station
 * Version: 2.0.0 (Bite 2.7 — multi-tier per account via account_tier_models join table)
 */
import { getServiceClient } from "@/lib/supabase/server";
import { decrypt } from "./crypto";

export type TierModel = {
  tier: "senior" | "mid" | "junior";
  model: string | null;
  enabled: boolean;
};

export type Account = {
  id: string;
  provider: string;
  auth_type: string;
  display_label: string;
  credential_ref: string | null;
  capabilities: Record<string, boolean>;
  capability_tier: "senior" | "mid" | "junior";
  status: string;
  enabled: boolean;
  priority: number;
  rate_limited_until: string | null;
  tier_models?: TierModel[];
};

export type ResolveInput = {
  provider?: "anthropic" | "openai" | "google" | "xai" | "station_proxy" | "auto";
  purpose?: string;
  tier?: "senior" | "mid" | "junior";
  strict?: boolean;
  exclude_account_ids?: string[];
};

export type ResolveResult =
  | { ok: true; account_id: string; account: Account; auth_type: string; credential: string; label: string; fallback_chain: Account[]; resolved_model?: string; reason?: string }
  | { ok: false; reason: string; attempted_provider: string; chain_exhausted?: boolean; error?: string; providers_eligible?: string[] };

/** Subscription auth types are preferred over metered API keys within the same tier */
const AUTH_TYPE_ORDER: Record<string, number> = {
  oauth_max: 0,
  oauth_pro: 1,
  oauth_subscription: 0,
  api_key: 2,
  station_proxy: 3,
};

/** Infer tier from model name when tier is not explicitly provided */
function inferTier(provider?: string, model?: string): "senior" | "mid" | "junior" | undefined {
  if (!model && !provider) return undefined;
  // Senior models
  if (model?.includes("opus") || model?.includes("o1") || model?.includes("o3") ||
      model?.includes("ultra") || model?.includes("grok-3")) return "senior";
  // Junior models
  if (model?.includes("haiku") || model?.includes("mini") || model?.includes("flash") ||
      model?.includes("grok-1")) return "junior";
  // Default to mid
  return undefined;
}

/** Check if an account is currently rate-limited */
function isRateLimited(account: Account): boolean {
  if (!account.rate_limited_until) return false;
  return new Date(account.rate_limited_until) > new Date();
}

/** Check if account is available for resolution */
function isAvailable(account: Account): boolean {
  return (
    account.enabled &&
    ["connected", "degraded"].includes(account.status) &&
    !isRateLimited(account)
  );
}

/** Check if account supports a given tier via join table, falling back to legacy scalar */
function accountSupportsTier(account: Account, tier: "senior" | "mid" | "junior"): boolean {
  if (account.tier_models && account.tier_models.length > 0) {
    return account.tier_models.some((tm) => tm.tier === tier && tm.enabled);
  }
  // Fallback: legacy scalar capability_tier
  return account.capability_tier === tier;
}

/** Sort accounts: subscription-first within tier, then by priority */
function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => {
    const aOrder = AUTH_TYPE_ORDER[a.auth_type] ?? 2;
    const bOrder = AUTH_TYPE_ORDER[b.auth_type] ?? 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.priority - b.priority;
  });
}

/** Look up the model for an account+tier — pinned model from join table, or catalog default */
async function resolveModel(
  db: ReturnType<typeof getServiceClient>,
  account: Account,
  tier: "senior" | "mid" | "junior"
): Promise<string | undefined> {
  // Check join table for a pinned model
  if (account.tier_models && account.tier_models.length > 0) {
    const tm = account.tier_models.find((t) => t.tier === tier && t.enabled);
    if (tm?.model) return tm.model;
  }

  // Fall back to catalog default for (provider, tier)
  const { data } = await db
    .from("model_catalog")
    .select("model")
    .eq("provider", account.provider)
    .eq("tier", tier)
    .eq("is_default", true)
    .is("deprecated_at", null)
    .limit(1)
    .single();

  return data?.model ?? undefined;
}

export async function resolveAccount(input: ResolveInput): Promise<ResolveResult> {
  const db = getServiceClient();
  const strict = input.strict ?? false;
  const requestedProvider = input.provider || "auto";

  // Fetch all enabled accounts with their tier_models join
  let query = db
    .from("accounts")
    .select("id, provider, auth_type, display_label, credential_ref, capabilities, capability_tier, status, enabled, priority, rate_limited_until, account_tier_models(tier, model, enabled)")
    .eq("enabled", true);

  // In strict mode, filter by provider
  if (strict && requestedProvider !== "auto") {
    query = query.eq("provider", requestedProvider);
  }

  const { data: rows, error } = await query.order("priority", { ascending: true });

  if (error) {
    console.error("[resolveAccount] DB error:", error.message);
  }

  // Map rows: attach tier_models from the join, filter to enabled only
  let accounts = (rows || []).map((row: Record<string, unknown>) => {
    const tierModelsRaw = (row.account_tier_models || []) as Array<{ tier: string; model: string | null; enabled: boolean }>;
    const tierModels: TierModel[] = tierModelsRaw
      .filter((tm) => tm.enabled)
      .map((tm) => ({ tier: tm.tier as "senior" | "mid" | "junior", model: tm.model, enabled: tm.enabled }));

    const account: Account = {
      id: row.id as string,
      provider: row.provider as string,
      auth_type: row.auth_type as string,
      display_label: row.display_label as string,
      credential_ref: row.credential_ref as string | null,
      capabilities: (row.capabilities || {}) as Record<string, boolean>,
      capability_tier: row.capability_tier as "senior" | "mid" | "junior",
      status: row.status as string,
      enabled: row.enabled as boolean,
      priority: row.priority as number,
      rate_limited_until: row.rate_limited_until as string | null,
      tier_models: tierModels,
    };
    return account;
  });

  // Exclude specific account IDs (for retry-after-failure)
  if (input.exclude_account_ids && input.exclude_account_ids.length > 0) {
    accounts = accounts.filter((a) => !input.exclude_account_ids!.includes(a.id));
  }

  // Filter by purpose capability if specified
  if (input.purpose && accounts.length > 0) {
    accounts = accounts.filter((a) => {
      if (!a.capabilities || Object.keys(a.capabilities).length === 0) return true;
      return a.capabilities[input.purpose!] === true;
    });
  }

  const desiredTier = input.tier || inferTier(requestedProvider);

  // --- STRICT MODE ---
  if (strict) {
    const available = accounts.filter(isAvailable);
    if (available.length === 0) {
      await db.from("account_usage_events").insert({
        event_type: "gate_blocked",
        detail: { provider: requestedProvider, reason: "strict_no_match", tier: desiredTier },
      });
      return {
        ok: false,
        reason: "strict_no_match",
        attempted_provider: requestedProvider,
        error: "no_enabled_account",
        providers_eligible: [],
      };
    }

    const sorted = sortAccounts(available);
    const primary = sorted[0];
    const credential = resolveCredential(primary);

    await db.from("account_usage_events").insert({
      account_id: primary.id,
      event_type: "resolved",
      detail: { purpose: input.purpose, mode: "strict", tier: primary.capability_tier },
    });

    return {
      ok: true,
      account_id: primary.id,
      account: primary,
      auth_type: primary.auth_type,
      credential,
      label: primary.display_label,
      fallback_chain: [],
    };
  }

  // --- SOFT MODE (default) ---
  // Build tier-matched chain using account_tier_models join table
  let tierCandidates: Account[];
  let reason: string | undefined;

  if (desiredTier) {
    // Filter by desired tier using multi-tier join table (with legacy fallback)
    tierCandidates = accounts.filter((a) => accountSupportsTier(a, desiredTier) && isAvailable(a));

    // Provider preference: if specific provider requested, prefer it
    if (requestedProvider !== "auto") {
      const providerFirst = tierCandidates.filter((a) => a.provider === requestedProvider);
      const providerRest = tierCandidates.filter((a) => a.provider !== requestedProvider);
      tierCandidates = [...providerFirst, ...providerRest];
    }

    // If no same-tier candidates, expand one tier in each direction
    if (tierCandidates.length === 0) {
      const tiers: Array<"senior" | "mid" | "junior"> = ["senior", "mid", "junior"];
      const desiredIdx = tiers.indexOf(desiredTier);

      // Try adjacent tiers
      const adjacentTiers: Array<"senior" | "mid" | "junior"> = [];
      if (desiredIdx > 0) adjacentTiers.push(tiers[desiredIdx - 1]);
      if (desiredIdx < tiers.length - 1) adjacentTiers.push(tiers[desiredIdx + 1]);

      for (const adjTier of adjacentTiers) {
        const adjCandidates = accounts.filter((a) => accountSupportsTier(a, adjTier) && isAvailable(a));
        if (adjCandidates.length > 0) {
          tierCandidates = adjCandidates;
          reason = desiredIdx > tiers.indexOf(adjTier) ? "tier_fallback_up" : "tier_fallback_down";
          break;
        }
      }
    }
  } else {
    // No tier preference — use all available, prefer requested provider
    tierCandidates = accounts.filter(isAvailable);
    if (requestedProvider !== "auto") {
      const providerFirst = tierCandidates.filter((a) => a.provider === requestedProvider);
      const providerRest = tierCandidates.filter((a) => a.provider !== requestedProvider);
      tierCandidates = [...providerFirst, ...providerRest];
    }
  }

  const sorted = sortAccounts(tierCandidates);

  if (sorted.length === 0) {
    // No candidates at all
    await db.from("account_usage_events").insert({
      event_type: "gate_blocked",
      detail: { provider: requestedProvider, reason: "chain_exhausted", tier: desiredTier },
    });

    return {
      ok: false,
      reason: "chain_exhausted",
      attempted_provider: requestedProvider,
      chain_exhausted: true,
      error: "no_enabled_account",
      providers_eligible: [],
    };
  }

  const primary = sorted[0];
  const fallbackChain = sorted.slice(1);
  const credential = resolveCredential(primary);

  // Resolve model for the primary account
  const resolvedModel = desiredTier ? await resolveModel(db, primary, desiredTier) : undefined;

  const now = new Date().toISOString();
  await Promise.all([
    db.from("account_usage_events").insert({
      account_id: primary.id,
      event_type: "resolved",
      detail: {
        purpose: input.purpose,
        mode: "soft",
        tier: desiredTier || primary.capability_tier,
        resolved_model: resolvedModel,
        fallback_chain_length: fallbackChain.length,
        reason,
      },
    }),
    db.from("accounts").update({ last_used_at: now }).eq("id", primary.id),
  ]);

  return {
    ok: true,
    account_id: primary.id,
    account: primary,
    auth_type: primary.auth_type,
    credential,
    label: primary.display_label,
    fallback_chain: fallbackChain,
    resolved_model: resolvedModel,
    reason,
  };
}

/** Decrypt credential from stored ref, or return "station_proxy" for proxy accounts */
function resolveCredential(account: Account): string {
  if (account.auth_type === "station_proxy") return "station_proxy";
  if (account.credential_ref) return decrypt(account.credential_ref);
  return "";
}

/** Resolve credential for a fallback account (used by chain-retry logic) */
export function resolveChainCredential(account: Account): string {
  return resolveCredential(account);
}
