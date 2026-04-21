import { NextResponse } from "next/server";
import { refreshModelCatalog } from "@/lib/model_catalog/refresh";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await refreshModelCatalog();
  return NextResponse.json(result);
}
