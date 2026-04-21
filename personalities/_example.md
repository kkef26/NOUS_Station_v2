---
slug: _example
name: EXAMPLE
role: DOCUMENTATION
default_provider: anthropic
default_model: claude-haiku-4-5-20251001
color_accent: "#888888"
quirks:
  template: true
is_hybrid: false
hybrid_parents: []
active: false
---

This is an example personality file that documents the expected format.

When authoring a new personality:
1. Copy this file and rename it (e.g., `jarvis.md`).
2. Fill in the frontmatter fields above.
3. Replace this body with the system prompt for the personality.
4. Run `npm run personalities:sync` to load into the database.

The `slug` field is the primary key. Use lowercase, no spaces.
The body below the frontmatter delimiter is the `system_prompt` — it is loaded verbatim.
