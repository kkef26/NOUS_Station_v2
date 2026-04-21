import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-nous-api-key");
  if (!apiKey || apiKey !== process.env.NOUS_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const dir = join(process.cwd(), "personalities");

  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const files = await readdir(dir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      try {
        const content = await readFile(join(dir, file), "utf-8");
        const { data: front, content: body } = matter(content);

        if (!front.slug || !front.name || !front.role || !front.default_provider || !front.default_model) {
          errors.push(`${file}: missing required frontmatter fields`);
          skipped++;
          continue;
        }

        const { error } = await db
          .from("personalities")
          .upsert(
            {
              slug: front.slug,
              name: front.name,
              role: front.role,
              system_prompt: body.trim(),
              default_provider: front.default_provider,
              default_model: front.default_model,
              color_accent: front.color_accent || null,
              quirks: front.quirks || null,
              is_hybrid: front.is_hybrid || false,
              hybrid_parents: front.hybrid_parents || [],
              active: front.active !== false,
              source_file: `personalities/${file}`,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "slug" }
          );

        if (error) {
          errors.push(`${file}: ${error.message}`);
          skipped++;
        } else {
          synced++;
        }
      } catch (err) {
        errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
        skipped++;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read personalities dir: ${err}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ synced, skipped, errors });
}
