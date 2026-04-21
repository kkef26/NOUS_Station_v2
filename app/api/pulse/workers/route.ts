import { NextResponse } from "next/server";
import { getNousUrl, getNousKey } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const nousUrl = getNousUrl();
    const nousKey = getNousKey();
    const resp = await fetch(`${nousUrl}/spawner/workers`, {
      headers: { "x-api-key": nousKey },
      cache: "no-store",
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ workers: [], error: String(err) });
  }
}
