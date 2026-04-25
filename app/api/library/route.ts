import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const project = searchParams.get("project");
  const search = searchParams.get("search");
  const pinned = searchParams.get("pinned");
  const has_clause = searchParams.get("has_clause");
  const since = searchParams.get("since");
  const sort = searchParams.get("sort") || "created_at";

  try {
    const db = getServiceClient();

    let query = db.from("library_artifacts").select("*");

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (project) query = query.eq("project", project);
    if (pinned === "true") query = query.eq("pinned", true);
    if (has_clause === "true") query = query.not("bible_clause", "is", null).neq("bible_clause", "");
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }
    if (since) {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(since, 10));
      query = query.gte("created_at", d.toISOString());
    }

    const sortCol = sort === "title" ? "title" : "created_at";
    query = query.order(sortCol, { ascending: sort === "title" });

    const { data: artifacts, error } = await query;
    if (error) throw error;

    // Facet counts
    const { data: byProject } = await db
      .from("library_artifacts")
      .select("project")
      .then(async (r) => {
        const counts: Record<string, number> = {};
        (r.data || []).forEach((row: { project: string }) => {
          counts[row.project] = (counts[row.project] || 0) + 1;
        });
        return { data: counts };
      });

    const { data: byType } = await db
      .from("library_artifacts")
      .select("type")
      .then(async (r) => {
        const counts: Record<string, number> = {};
        (r.data || []).forEach((row: { type: string }) => {
          counts[row.type] = (counts[row.type] || 0) + 1;
        });
        return { data: counts };
      });

    const { data: byStatus } = await db
      .from("library_artifacts")
      .select("status")
      .then(async (r) => {
        const counts: Record<string, number> = {};
        (r.data || []).forEach((row: { status: string }) => {
          counts[row.status] = (counts[row.status] || 0) + 1;
        });
        return { data: counts };
      });

    const { count: pinnedCount } = await db
      .from("library_artifacts")
      .select("*", { count: "exact", head: true })
      .eq("pinned", true);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { count: recentCount } = await db
      .from("library_artifacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo.toISOString());

    return NextResponse.json({
      artifacts: artifacts || [],
      facet_counts: {
        total: artifacts?.length || 0,
        pinned: pinnedCount || 0,
        recent_7d: recentCount || 0,
        by_project: byProject || {},
        by_type: byType || {},
        by_status: byStatus || {},
      },
    });
  } catch (err) {
    console.error("[library GET]", err);
    return NextResponse.json({ error: "Failed to fetch artifacts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getServiceClient();
    const { data, error } = await db
      .from("library_artifacts")
      .insert({
        workspace_id: body.workspace_id || "kosta",
        project: body.project,
        type: body.type,
        title: body.title,
        content: body.content || "",
        content_ref: body.content_ref || null,
        source_agent: body.source_agent || null,
        source_session: body.source_session || null,
        pinned: body.pinned || false,
        tags: body.tags || [],
        status: body.status || "draft",
        owner: body.owner || "kosta",
        bible_clause: body.bible_clause || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ artifact: data }, { status: 201 });
  } catch (err) {
    console.error("[library POST]", err);
    return NextResponse.json({ error: "Failed to create artifact" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
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
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ artifact: data });
  } catch (err) {
    console.error("[library PATCH]", err);
    return NextResponse.json({ error: "Failed to update artifact" }, { status: 500 });
  }
}
