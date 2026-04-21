-- NST.19.7 r3 Bite 2 — Chat persistence, Personalities, Uploads, Level events, Boardroom extensions
-- Applied via Supabase MCP apply_migration on 2026-04-21

-- 1a. Chat persistence
create table if not exists nous.chat_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  title text,
  summary text,
  message_count int not null default 0,
  last_message_at timestamptz,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_chat_threads_workspace on nous.chat_threads(workspace_id);
create index if not exists idx_chat_threads_last_msg on nous.chat_threads(last_message_at desc nulls last);

create table if not exists nous.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references nous.chat_threads(id) on delete cascade,
  workspace_id uuid,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  provider text,
  model text,
  personality text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  attachments jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_thread on nous.chat_messages(thread_id, created_at);
create index if not exists idx_chat_messages_workspace on nous.chat_messages(workspace_id);

-- 1b. Personality registry
create table if not exists nous.personalities (
  slug text primary key,
  name text not null,
  role text not null,
  system_prompt text not null,
  default_provider text not null,
  default_model text not null,
  color_accent text,
  quirks jsonb,
  is_hybrid boolean not null default false,
  hybrid_parents text[],
  active boolean not null default true,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1c. Boardroom extensions
alter table nous.boardroom_threads add column if not exists synthesis_message_id uuid;
alter table nous.boardroom_threads add column if not exists turn_mode text default 'round_robin';
alter table nous.boardroom_threads add column if not exists chair_seat text;
alter table nous.boardroom_threads add column if not exists minted_artifacts jsonb;

alter table nous.boardroom_seat_turns add column if not exists provider text;
alter table nous.boardroom_seat_turns add column if not exists model text;
alter table nous.boardroom_seat_turns add column if not exists tokens_in int;
alter table nous.boardroom_seat_turns add column if not exists tokens_out int;
alter table nous.boardroom_seat_turns add column if not exists latency_ms int;

-- 1d. Uploads
create table if not exists nous.uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  filename text not null,
  size_bytes bigint not null,
  mime text,
  storage_path text,
  created_at timestamptz not null default now()
);
create index if not exists idx_uploads_workspace on nous.uploads(workspace_id);

-- 1e. Level telemetry
create table if not exists nous.level_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  level int not null check (level between 1 and 5),
  signal text not null,
  delta numeric,
  context jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_level_events_workspace_level on nous.level_events(workspace_id, level);
