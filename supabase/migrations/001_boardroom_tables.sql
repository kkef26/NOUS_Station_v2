-- NST.19.7 r3 Bite 1 — Boardroom tables + workspace_id columns
-- Target: NOUS instance oozlawunlkkuaykfunan

-- New tables
create table if not exists nous.boardroom_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  topic text not null,
  status text not null default 'active',
  personalities_seated text[] not null,
  providers_seated text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nous.boardroom_seat_turns (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references nous.boardroom_threads(id) on delete cascade,
  seat_personality text not null,
  seat_provider text not null,
  turn_index int not null,
  content text,
  silence boolean not null default false,
  created_at timestamptz not null default now()
);

-- workspace_id columns on existing tables (idempotent — skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nous' AND table_name='memories' AND column_name='workspace_id') THEN
    ALTER TABLE nous.memories ADD COLUMN workspace_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nous' AND table_name='bible_clauses' AND column_name='workspace_id') THEN
    ALTER TABLE nous.bible_clauses ADD COLUMN workspace_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nous' AND table_name='dispatch_queue' AND column_name='workspace_id') THEN
    ALTER TABLE nous.dispatch_queue ADD COLUMN workspace_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nous' AND table_name='triage_entries' AND column_name='workspace_id') THEN
    ALTER TABLE nous.triage_entries ADD COLUMN workspace_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nous' AND table_name='sessions' AND column_name='workspace_id') THEN
    ALTER TABLE nous.sessions ADD COLUMN workspace_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nous' AND table_name='friction' AND column_name='workspace_id') THEN
    ALTER TABLE nous.friction ADD COLUMN workspace_id uuid;
  END IF;
END $$;

-- Indexes
create index if not exists idx_memories_workspace on nous.memories(workspace_id);
create index if not exists idx_bible_clauses_workspace on nous.bible_clauses(workspace_id);
create index if not exists idx_dispatch_queue_workspace on nous.dispatch_queue(workspace_id);
create index if not exists idx_triage_entries_workspace on nous.triage_entries(workspace_id);
create index if not exists idx_sessions_workspace on nous.sessions(workspace_id);
create index if not exists idx_friction_workspace on nous.friction(workspace_id);
create index if not exists idx_boardroom_threads_workspace on nous.boardroom_threads(workspace_id);
create index if not exists idx_seat_turns_thread on nous.boardroom_seat_turns(thread_id);
