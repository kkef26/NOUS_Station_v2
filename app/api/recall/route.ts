import { NextRequest, NextResponse } from "next/server";
import { getNousUrl, getNousKey } from "@/lib/supabase/server";
import { emitLevel } from "@/lib/levels/emit";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });

  try {
    const nousUrl = getNousUrl();
    const nousKey = getNousKey();

    const resp = await fetch(`${nousUrl}/recall?q=${encodeURIComponent(q)}`, {
      headers: { "x-api-key": nousKey },
      cache: "no-store",
    });

    const data = await resp.json();

    emitLevel("recall_invoked", 2);

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
