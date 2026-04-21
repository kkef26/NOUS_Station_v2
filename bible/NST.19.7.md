---
id: NST.19.7
revision: r4
hash: sha256:auto
status: active
---

# NST.19.7 — NOUS Station Surface Triple

## §10.5 API Keys & Account Model

The account model lives in `nous.accounts`. Each account row represents a single provider credential (API key, OAuth token, or station proxy reference). Accounts have:

- **Masked input / status LED** — credential_ref is AES-256-GCM encrypted; the UI never shows raw keys. Status LED (connected/degraded/rate_limited/provider_down/expired/error/disconnected) is visible per row.
- **Priority ordering** — lower priority number = preferred. Resolver picks highest-priority available account per tier.
- **Enable/disable toggle** — disabled accounts are invisible to the resolver.

### §10.5.1 Multi-tier per account

A single account row can serve multiple tiers (senior, mid, junior) via the `nous.account_tier_models` join table. Each row in the join table links an account to a tier with an optional pinned model string and an enabled flag.

**Contract:**
- One account → 0..3 tier_model rows (one per tier at most, enforced by UNIQUE constraint).
- When the resolver seeks a tier, it joins through `account_tier_models WHERE enabled=true` to find eligible accounts.
- **Legacy fallback:** if an account has zero join rows, the resolver falls back to the scalar `nous.accounts.capability_tier` column. This column is deprecated (2026-04-21) and will be dropped once all accounts are backfilled.
- The API response shape includes `tier_models: [{tier, model, enabled}, ...]` per account. The bare `capability_tier` field is omitted from API responses.
- When a tier_model row has `model = NULL`, the resolver pulls the default model from `nous.model_catalog` for `(provider, tier)`.

**UI contract:** each account row renders three tier toggles — [Senior] [Mid] [Junior] — with per-tier model pickers sourced from the model catalog.

## §10.6 Model Bench & Catalog

Per-seat model selection in the Boardroom / Council pulls defaults from `nous.model_catalog`.

**Model catalog table (`nous.model_catalog`):**
- Registry of available models per `(provider, tier)`.
- Columns: provider, tier, model (unique per provider), display_name, is_default (one true per provider+tier), context_window, released_at, deprecated_at (NULL = current), source (manual/rss/self_announce), last_seen_at.
- The catalog is seeded with known models and will be refreshed by a future cron job (`lib/model_catalog/refresh.ts` stub exists).

**Model selection per (account × tier)** pulls defaults from `nous.model_catalog`. When an account's tier_model row has a pinned model, that takes precedence over the catalog default. When NULL, the catalog default for `(provider, tier)` is used.

---

## Changelog

| Rev | Date | Author | Summary |
|-----|------|--------|---------|
| r1 | 2026-04-12 | kosta | Initial surface triple spec |
| r2 | 2026-04-13 | kosta | Bite 2.6 account model + consumption gate |
| r3 | 2026-04-18 | kosta | Bite 2.6.1 soft-handover fallback chain |
| r4 | 2026-04-21 | c2-worker | Bite 2.7 multi-tier per account + model catalog (§10.5.1, §10.6 amendment) |
