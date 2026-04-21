import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/accounts/crypto";

export async function GET() {
  const db = getServiceClient();
  const { data, error } = await db
    .from("accounts")
    .select("id, provider, auth_type, display_label, status, enabled, priority, capabilities, capability_tier, quota_hint, notes, created_at, updated_at, last_used_at, last_error_at, last_error_detail, rate_limit_remaining, rate_limited_until, status_reason, status_source, last_known_good_at")
    .order("priority", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ accounts: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.provider || !body.auth_type || !body.display_label) {
    return NextResponse.json({ error: "Missing required fields: provider, auth_type, display_label" }, { status: 400 });
  }

  const { provider, auth_type, display_label, priority, credential, capabilities, notes, capability_tier } = body;

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

  const db = getServiceClient();
  const { data, error } = await db
    .from("accounts")
    .insert({
      provider,
      auth_type,
      display_label,
      priority: priority ?? 100,
      credential_ref,
      capabilities: capabilities ?? {},
      capability_tier: capability_tier ?? "mid",
      notes: notes ?? null,
      enabled: false,
    })
    .select("id, provider, auth_type, display_label, status, enabled, priority, capabilities, notes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ account: data }, { status: 201 });
}
