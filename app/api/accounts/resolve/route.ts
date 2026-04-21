// Service-to-service account resolver — used by station proxy and internal services.
// Auth: shared secret in x-station-secret header.
import { NextRequest, NextResponse } from "next/server";
import { resolveAccount, type ResolveInput } from "@/lib/accounts/resolve";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-station-secret");
  const expected = process.env.STATION_PROXY_SHARED_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: ResolveInput = await req.json().catch(() => null);
  if (!body || !body.provider) {
    return NextResponse.json({ error: "Missing provider in body" }, { status: 400 });
  }

  const result = await resolveAccount(body);
  return NextResponse.json(result);
}
