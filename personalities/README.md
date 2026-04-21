# NOUS Personalities

Each `.md` file in this directory defines a personality that can be seated in the Boardroom or used in Chat.

## Format

```yaml
---
slug: my-personality        # primary key, lowercase, no spaces
name: My Personality        # display name
role: ANALYST               # role label
default_provider: anthropic # anthropic | openai | google | xai
default_model: claude-sonnet-4-6
color_accent: "#3ad6c4"    # hex color for UI hairline
quirks:                     # freeform JSON, optional
  key: value
is_hybrid: false            # true if synthesized from parents
hybrid_parents: []          # list of parent slugs if hybrid
active: true                # false = loaded but never seated
---

System prompt body in markdown. Everything below the frontmatter closing
delimiter is loaded verbatim as `system_prompt`.
```

## Sync

Run `npm run personalities:sync` to upsert all personalities into `nous.personalities`.
Files starting with `_` are included in sync (but `_example.md` has `active: false`).

The sync script validates frontmatter — if any file has invalid fields, the build breaks.
