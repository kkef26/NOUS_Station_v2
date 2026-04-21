import { NextResponse } from "next/server";
import { getNousUrl, getNousKey } from "@/lib/supabase/server";

export async function GET() {
  try {
    const nousUrl = getNousUrl();
    const nousKey = getNousKey();
    const resp = await fetch(`${nousUrl}/status?hours=24`, {
      headers: { "x-api-key": nousKey },
      cache: "no-store",
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ pending: 0, running: 0, error: String(err) });
  }
}
