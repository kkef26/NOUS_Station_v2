-- Bite 2.6.1 — Soft-Handover Fallback Chain (NST.19.7 r3)
-- D1: Extend nous.accounts with tier, status_source, rate-limit tracking
-- D2: Create nous.provider_status_feed for statuspage polling
-- Blast radius: infra — all LLM call paths depend on these columns

-- D1: Extend accounts table
ALTER TABLE nous.accounts
  ADD COLUMN IF NOT EXISTS capability_tier text
    CHECK (capability_tier IN ('senior','mid','junior'))
    NOT NULL DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS status_source text,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS rate_limit_remaining jsonb,
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_known_good_at timestamptz;

-- Extend status CHECK to include new values
-- Drop old CHECK constraint and add new one
ALTER TABLE nous.accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE nous.accounts ADD CONSTRAINT accounts_status_check
  CHECK (status IN ('connected','disconnected','expired','error','degraded','rate_limited','provider_down'));

-- Extend event_type CHECK on usage_events
ALTER TABLE nous.account_usage_events DROP CONSTRAINT IF EXISTS account_usage_events_event_type_check;
ALTER TABLE nous.account_usage_events ADD CONSTRAINT account_usage_events_event_type_check
  CHECK (event_type IN ('enabled','disabled','connected','disconnected','used','error','gate_blocked','resolved','fallback_fire'));

-- Seed Station Proxy as senior tier
UPDATE nous.accounts
  SET capability_tier = 'senior'
  WHERE provider = 'station_proxy';

-- Composite index for tier-aware resolution
CREATE INDEX IF NOT EXISTS idx_accounts_tier_status_priority
  ON nous.accounts (capability_tier, status, priority ASC)
  WHERE enabled = true;

-- D2: Provider status feed table
CREATE TABLE IF NOT EXISTS nous.provider_status_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  incident_id text,
  component text,
  severity text,
  status text,
  title text,
  url text,
  started_at timestamptz,
  resolved_at timestamptz,
  raw jsonb,
  observed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_status_feed_provider_observed
  ON nous.provider_status_feed (provider, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_status_feed_unresolved
  ON nous.provider_status_feed (provider, resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE nous.provider_status_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON nous.provider_status_feed
  FOR ALL USING (auth.role() = 'service_role');
