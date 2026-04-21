import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const db = getServiceClient();

  const { data, error } = await db
    .from("accounts")
    .update({ enabled: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, enabled")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await db.from("account_usage_events").insert({
    account_id: id,
    event_type: "enabled",
    detail: null,
  });

  return NextResponse.json({ ok: true, enabled: true });
}
