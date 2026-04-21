import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const db = getServiceClient();

  let query = db
    .from("model_catalog")
    .select("tier, model, display_name, is_default, context_window, released_at, source")
    .is("deprecated_at", null)
    .order("tier", { ascending: true });

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
