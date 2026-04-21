# NOUS Station v2

Living-system command interface for the NOUS fleet.

## Clause Anchor

**NST.19.7 r3** — defines all surfaces, drawers, personalities, council agent, and level mechanics.

## Architecture

- **Surfaces**: Chat (`/chat`), Boardroom (`/boardroom`), Project (`/project/[slug]`)
- **Drawers**: Pulse (fleet/queue/signals tiles), Factory (scheduled items), Fleet (live workers), Signals (friction/events/levels)
- **Personalities**: Markdown files in `personalities/` synced to `nous.personalities` at build time
- **Council Agent**: Keyword-based seat routing, round-robin/mention/everyone/consensus/chair turn modes, synthesis
- **LLM Providers**: Anthropic, OpenAI, Google Gemini, xAI Grok — unified streaming interface
- **Level Telemetry**: L1 (message_sent, thread_created, slash_command_used, boardroom_opened) and L2 (recall_invoked, dispatch_fired, synthesis_generated)

## Env Vars

| Var | Required | Used for |
|-----|----------|----------|
| `ANTHROPIC_API_KEY` | yes | Anthropic provider |
| `OPENAI_API_KEY` | yes | OpenAI provider |
| `GOOGLE_API_KEY` | optional | Google Gemini |
| `GROK_API_KEY` | optional | xAI Grok |
| `SUPABASE_SERVICE_ROLE_NOUS` | yes | Direct Supabase writes |
| `NOUS_API_KEY` | yes | All NOUS edge function calls |
| `NOUS` | yes | Base URL for NOUS functions |

## Local Dev

```bash
npm install
npm run dev
```

## Deploy

Push to `main` on GitHub. Vercel auto-deploys.

## Personality Authoring

See `personalities/README.md` for the format. Run `npm run personalities:sync` to load into the database.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ⌘1 | Chat |
| ⌘2 | Boardroom |
| ⌘3 | Project |
| ⌘P | Toggle Pulse drawer |
| ⌘F | Toggle Factory drawer |
| ⌘L | Toggle Fleet drawer |
| ⌘S | Toggle Signals drawer |
| ⌘K | Toggle Composer |
| ⌘, | Settings |
| ⌘⇧T | Toggle theme |
| ⌘⇧↵ | Fork to new thread |
| ⌘G | Toggle density |
| ⌘. | Cycle personality |
| N | New thread / Focus topic |
| J / K | Next / Prev thread |
| / | Focus composer with slash |
| ? | Keyboard help |
| Esc | Close top overlay |
