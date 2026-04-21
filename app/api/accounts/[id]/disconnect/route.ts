import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const db = getServiceClient();

  const { data, error } = await db
    .from("accounts")
    .update({
      credential_ref: null,
      status: "disconnected",
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, status, enabled")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await db.from("account_usage_events").insert({
    account_id: id,
    event_type: "disconnected",
    detail: { reason: "manual_disconnect" },
  });

  return NextResponse.json({ ok: true, status: "disconnected" });
}
