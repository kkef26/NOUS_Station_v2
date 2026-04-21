-- Bite 2.7 — Multi-Tier Account Model + Model Catalog (NST.19.7 §10.5/10.6 amendment)
-- Join table: one account → many tiers, optionally pinning a specific model per tier.
CREATE TABLE IF NOT EXISTS nous.account_tier_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES nous.accounts(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('senior','mid','junior')),
  model text,                              -- nullable; NULL = use catalog default for (provider, tier)
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, tier)
);

CREATE INDEX IF NOT EXISTS account_tier_models_account_idx ON nous.account_tier_models (account_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS account_tier_models_tier_idx    ON nous.account_tier_models (tier)       WHERE enabled;

-- Model catalog: registry of available models per provider per tier.
CREATE TABLE IF NOT EXISTS nous.model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('senior','mid','junior')),
  model text NOT NULL,                     -- e.g. 'claude-opus-4-6'
  display_name text NOT NULL,              -- e.g. 'Claude Opus 4.6'
  is_default boolean NOT NULL DEFAULT false, -- one true per (provider, tier)
  context_window int,
  released_at date,
  deprecated_at date,                      -- NULL = current
  source text,                             -- 'manual' | 'rss' | 'self_announce' | etc.
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model)
);

CREATE INDEX IF NOT EXISTS model_catalog_lookup_idx ON nous.model_catalog (provider, tier) WHERE deprecated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS model_catalog_one_default_per_tier
  ON nous.model_catalog (provider, tier) WHERE is_default AND deprecated_at IS NULL;

-- Backfill from existing scalar capability_tier.
INSERT INTO nous.account_tier_models (account_id, tier, model, enabled)
SELECT id, capability_tier, NULL, true
FROM nous.accounts
WHERE capability_tier IS NOT NULL
ON CONFLICT (account_id, tier) DO NOTHING;

-- Seed catalog with current Anthropic models.
INSERT INTO nous.model_catalog (provider, tier, model, display_name, is_default, context_window, source) VALUES
  ('anthropic','senior','claude-opus-4-6','Claude Opus 4.6',true,200000,'manual'),
  ('anthropic','mid','claude-sonnet-4-6','Claude Sonnet 4.6',true,200000,'manual'),
  ('anthropic','junior','claude-haiku-4-5-20251001','Claude Haiku 4.5',true,200000,'manual')
ON CONFLICT (provider, model) DO NOTHING;

-- RLS policies
ALTER TABLE nous.account_tier_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON nous.account_tier_models
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE nous.model_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON nous.model_catalog
  FOR ALL USING (auth.role() = 'service_role');

-- Mark capability_tier as legacy. Do NOT drop it — resolver still reads it as fallback during transition.
COMMENT ON COLUMN nous.accounts.capability_tier IS 'LEGACY (deprecated 2026-04-21). Use nous.account_tier_models. Kept as fallback during transition.';
