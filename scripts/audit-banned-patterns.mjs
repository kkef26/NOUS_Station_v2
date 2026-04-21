#!/usr/bin/env node

/**
 * Banned-pattern audit for NOUS Station v2 (NST.19.7 r3 §8)
 * Exit nonzero if any banned brain-AI design clichés found.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const VIOLATIONS = [];

const EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".html", ".mdx", ".md",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "out", "build", ".vercel",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (EXTENSIONS.has(ext)) {
        files.push(full);
      }
    }
  }
  return files;
}

function check(filePath, content) {
  const rel = filePath.replace(ROOT + "/", "");
  const lines = content.split("\n");
  const name = basename(filePath).toLowerCase();

  // Skip audit script itself
  if (rel === "scripts/audit-banned-patterns.mjs") return;

  lines.forEach((line, i) => {
    const lineNum = i + 1;

    // 1. Mac dots — three-circle window chrome
    if (/mac\s*dots/i.test(line)) {
      VIOLATIONS.push(`${rel}:${lineNum} — "mac dots" (three-circle window chrome)`);
    }

    // 2. Gradient orbs
    if (/gradient\s*orb/i.test(line)) {
      VIOLATIONS.push(`${rel}:${lineNum} — "gradient orb" pattern`);
    }

    // 3. DM Sans font
    if (/DM\s*Sans/i.test(line)) {
      VIOLATIONS.push(`${rel}:${lineNum} — "DM Sans" font (banned)`);
    }

    // 4. Brain emoji in JSX/MDX
    if (/\.(tsx|jsx|mdx)$/.test(filePath) && line.includes("\u{1F9E0}")) {
      VIOLATIONS.push(`${rel}:${lineNum} — brain emoji 🧠 in JSX/MDX`);
    }

    // 5. 3-col feature grids in marketing-style layouts
    if (
      (name.startsWith("features") || name.startsWith("landing")) &&
      /grid-cols-3/.test(line)
    ) {
      VIOLATIONS.push(`${rel}:${lineNum} — "grid-cols-3" in marketing-style layout`);
    }
  });
}

async function main() {
  const files = await walk(ROOT);
  for (const f of files) {
    const content = await readFile(f, "utf-8");
    check(f, content);
  }

  if (VIOLATIONS.length > 0) {
    console.error("❌ BANNED PATTERNS FOUND:\n");
    VIOLATIONS.forEach((v) => console.error(`  ${v}`));
    console.error(`\n${VIOLATIONS.length} violation(s). Fix before deploy.`);
    process.exit(1);
  }

  console.log("✓ No banned patterns found.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit script error:", err);
  process.exit(1);
});
