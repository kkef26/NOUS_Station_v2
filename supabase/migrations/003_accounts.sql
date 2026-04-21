-- Bite 2.6 — Account Model & Consumption Gate (NST.19.7 r3)
-- Applied via MCP; this file records the migration for git history.

create table if not exists nous.accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('anthropic','openai','google','xai','station_proxy')),
  auth_type text not null check (auth_type in ('oauth_max','oauth_pro','api_key','station_proxy')),
  display_label text not null,
  status text not null default 'connected' check (status in ('connected','disconnected','expired','error')),
  enabled boolean not null default false,
  priority int not null default 100,
  credential_ref text,
  capabilities jsonb not null default '{}'::jsonb,
  quota_hint jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error_at timestamptz,
  last_error_detail text
);

create index if not exists idx_accounts_provider_enabled on nous.accounts(provider, enabled) where status = 'connected';
create index if not exists idx_accounts_priority on nous.accounts(priority);

alter table nous.accounts enable row level security;
create policy "service_role_all" on nous.accounts for all using (auth.role() = 'service_role');

create table if not exists nous.account_usage_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references nous.accounts(id) on delete cascade,
  event_type text not null check (event_type in ('enabled','disabled','connected','disconnected','used','error','gate_blocked')),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_usage_acct on nous.account_usage_events(account_id, created_at desc);
alter table nous.account_usage_events enable row level security;
create policy "service_role_all" on nous.account_usage_events for all using (auth.role() = 'service_role');

insert into nous.accounts (provider, auth_type, display_label, status, enabled, priority, notes)
values ('station_proxy','station_proxy','Station Proxy (EC2)','connected', true, 10, 'Legacy workaround — routes via 54.86.33.89. Enabled by default for continuity.')
on conflict do nothing;
