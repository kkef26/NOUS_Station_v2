import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("library_artifacts")
      .select("*")
      .eq("id", params.id)
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ artifact: data });
  } catch (err) {
    console.error("[library/id GET]", err);
    return NextResponse.json({ error: "Failed to fetch artifact" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const db = getServiceClient();
    const allowed = ["pinned", "status", "title", "content", "tags", "bible_clause", "owner"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in body) patch[k] = body[k];
    }
    const { data, error } = await db
      .from("library_artifacts")
      .update(patch)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ artifact: data });
  } catch (err) {
    console.error("[library/id PATCH]", err);
    return NextResponse.json({ error: "Failed to update artifact" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getServiceClient();
    const { error } = await db
      .from("library_artifacts")
      .delete()
      .eq("id", params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[library/id DELETE]", err);
    return NextResponse.json({ error: "Failed to delete artifact" }, { status: 500 });
  }
}
