import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

const ALLOWED_PATCH_FIELDS = new Set(["display_label", "priority", "status", "enabled", "capabilities", "notes"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceClient();

  // Handle tier_models replacement if provided
  if (body.tier_models && Array.isArray(body.tier_models)) {
    // Delete existing tier_models and replace
    await db.from("account_tier_models").delete().eq("account_id", id);

    const tierModelRows = body.tier_models.map((tm: { tier: string; model: string | null; enabled: boolean }) => ({
      account_id: id,
      tier: tm.tier,
      model: tm.model || null,
      enabled: tm.enabled ?? true,
    }));

    if (tierModelRows.length > 0) {
      const { error: tmError } = await db.from("account_tier_models").insert(tierModelRows);
      if (tmError) {
        return NextResponse.json({ error: `tier_models error: ${tmError.message}` }, { status: 500 });
      }
    }

    // Update legacy capability_tier to match first enabled tier
    const firstEnabled = body.tier_models.find((tm: { enabled: boolean }) => tm.enabled);
    if (firstEnabled) {
      await db.from("accounts").update({ capability_tier: firstEnabled.tier, updated_at: new Date().toISOString() }).eq("id", id);
    }
  }

  // Handle standard field updates
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_PATCH_FIELDS.has(k)) update[k] = v;
  }

  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString();
    const { error } = await db.from("accounts").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch updated account with tier_models
  const { data, error: fetchError } = await db
    .from("accounts")
    .select("id, provider, auth_type, display_label, status, enabled, priority, capabilities, notes, updated_at, account_tier_models(tier, model, enabled)")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const tierModelsRaw = ((data as Record<string, unknown>).account_tier_models || []) as Array<{ tier: string; model: string | null; enabled: boolean }>;
  const { account_tier_models: _atm, ...rest } = data as Record<string, unknown>;

  const changedFields = [...Object.keys(update).filter((k) => k !== "updated_at"), ...(body.tier_models ? ["tier_models"] : [])];
  await db.from("account_usage_events").insert({
    account_id: id,
    event_type: "connected",
    detail: { changed: changedFields },
  });

  return NextResponse.json({
    account: {
      ...rest,
      tier_models: tierModelsRaw.map((tm) => ({ tier: tm.tier, model: tm.model, enabled: tm.enabled })),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const db = getServiceClient();

  await db.from("accounts").update({ enabled: false, status: "disconnected" }).eq("id", id);
  await db.from("account_usage_events").insert({
    account_id: id,
    event_type: "disconnected",
    detail: { reason: "hard_delete" },
  });

  const { error } = await db.from("accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
