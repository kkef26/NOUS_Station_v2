import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

const ALLOWED_PATCH_FIELDS = new Set(["display_label", "priority", "status", "enabled", "capabilities", "capability_tier", "notes"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_PATCH_FIELDS.has(k)) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No patchable fields provided" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const db = getServiceClient();
  const { data, error } = await db
    .from("accounts")
    .update(update)
    .eq("id", id)
    .select("id, provider, auth_type, display_label, status, enabled, priority, capabilities, capability_tier, notes, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const changedFields = Object.keys(update).filter((k) => k !== "updated_at");
  await db.from("account_usage_events").insert({
    account_id: id,
    event_type: "connected",
    detail: { changed: changedFields, values: update },
  });

  return NextResponse.json({ account: data });
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
