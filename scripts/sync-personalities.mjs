#!/usr/bin/env node

/**
 * Personality sync script for NOUS Station v2
 * Reads *.md files from personalities/ and upserts into nous.personalities
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oozlawunlkkuaykfunan.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_NOUS;

if (!SUPABASE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_NOUS is not set");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "nous" },
  auth: { persistSession: false },
});

const REQUIRED_FIELDS = ["slug", "name", "role", "default_provider", "default_model"];
const PERSONALITIES_DIR = join(process.cwd(), "personalities");

async function main() {
  let synced = 0;
  let skipped = 0;
  const errors = [];

  const files = await readdir(PERSONALITIES_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md") && f !== "README.md");

  for (const file of mdFiles) {
    const filePath = join(PERSONALITIES_DIR, file);
    const raw = await readFile(filePath, "utf-8");
    const { data: front, content: body } = matter(raw);

    // Validate required fields
    const missing = REQUIRED_FIELDS.filter((f) => !front[f]);
    if (missing.length > 0) {
      errors.push(`${file}: missing required fields: ${missing.join(", ")}`);
      skipped++;
      continue;
    }

    const row = {
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
      active: front.active !== undefined ? front.active : true,
      source_file: `personalities/${file}`,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db.from("personalities").upsert(row, { onConflict: "slug" });

    if (error) {
      errors.push(`${file}: ${error.message}`);
      skipped++;
    } else {
      synced++;
      console.log(`  synced: ${front.slug} (${file})`);
    }
  }

  console.log(`\nPersonality sync complete: ${synced} synced, ${skipped} skipped`);

  if (errors.length > 0) {
    console.error("\nErrors:");
    errors.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Personality sync failed:", err);
  process.exit(1);
});
