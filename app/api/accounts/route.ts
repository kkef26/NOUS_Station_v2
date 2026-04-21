import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/accounts/crypto";

export async function GET() {
  const db = getServiceClient();

  // Fetch accounts with their tier_models join
  const { data, error } = await db
    .from("accounts")
    .select("id, provider, auth_type, display_label, status, enabled, priority, capabilities, capability_tier, quota_hint, notes, created_at, updated_at, last_used_at, last_error_at, last_error_detail, rate_limit_remaining, rate_limited_until, status_reason, status_source, last_known_good_at, account_tier_models(tier, model, enabled)")
    .order("priority", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform: attach tier_models array, drop bare capability_tier from response
  const accounts = (data || []).map((row: Record<string, unknown>) => {
    const tierModelsRaw = (row.account_tier_models || []) as Array<{ tier: string; model: string | null; enabled: boolean }>;
    const tierModels = tierModelsRaw.map((tm) => ({
      tier: tm.tier,
      model: tm.model,
      enabled: tm.enabled,
    }));

    // Omit capability_tier and account_tier_models raw join from response
    const { capability_tier: _ct, account_tier_models: _atm, ...rest } = row;
    return { ...rest, tier_models: tierModels };
  });

  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.provider || !body.auth_type || !body.display_label) {
    return NextResponse.json({ error: "Missing required fields: provider, auth_type, display_label" }, { status: 400 });
  }

  const { provider, auth_type, display_label, priority, credential, capabilities, notes, tier_models } = body;

  // OAuth for non-Anthropic providers not yet implemented
  if (provider !== "anthropic" && provider !== "station_proxy" && auth_type !== "api_key") {
    return NextResponse.json(
      { error: "Not implemented", message: "OAuth for this provider is not yet implemented. Use auth_type: api_key instead." },
      { status: 501 }
    );
  }

  let credential_ref: string | null = null;
  if (auth_type === "api_key") {
    if (!credential) {
      return NextResponse.json({ error: "credential is required for auth_type=api_key" }, { status: 400 });
    }
    credential_ref = encrypt(credential);
  }

  // Default tier_models if not provided
  const effectiveTierModels: Array<{ tier: string; model: string | null; enabled: boolean }> =
    tier_models && Array.isArray(tier_models) && tier_models.length > 0
      ? tier_models
      : [{ tier: "mid", model: null, enabled: true }];

  // Derive legacy capability_tier from first enabled tier for backwards compat
  const firstEnabledTier = effectiveTierModels.find((tm: { enabled: boolean }) => tm.enabled);
  const legacyTier = firstEnabledTier ? firstEnabledTier.tier : "mid";

  const db = getServiceClient();

  // Insert account
  const { data, error } = await db
    .from("accounts")
    .insert({
      provider,
      auth_type,
      display_label,
      priority: priority ?? 100,
      credential_ref,
      capabilities: capabilities ?? {},
      capability_tier: legacyTier,
      notes: notes ?? null,
      enabled: false,
    })
    .select("id, provider, auth_type, display_label, status, enabled, priority, capabilities, notes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert tier_models join rows
  const tierModelRows = effectiveTierModels.map((tm: { tier: string; model: string | null; enabled: boolean }) => ({
    account_id: data.id,
    tier: tm.tier,
    model: tm.model || null,
    enabled: tm.enabled ?? true,
  }));

  const { error: tmError } = await db.from("account_tier_models").insert(tierModelRows);
  if (tmError) {
    console.error("[POST /api/accounts] tier_models insert error:", tmError.message);
  }

  return NextResponse.json({
    account: {
      ...data,
      tier_models: effectiveTierModels.map((tm: { tier: string; model: string | null; enabled: boolean }) => ({
        tier: tm.tier,
        model: tm.model || null,
        enabled: tm.enabled ?? true,
      })),
    },
  }, { status: 201 });
}
