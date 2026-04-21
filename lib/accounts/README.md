# lib/accounts/ — Account Resolver & Soft-Handover Chain

## Purpose
Central chokepoint for all LLM API access. Every provider call must pass through `resolveAccount()`.
Implements tier-matched cross-provider fallback (cellular-style 2G→3G→4G handover).

## Version: 1.1.0 (Bite 2.6.1)

## Files

| File | Purpose |
|---|---|
| `resolve.ts` | Account resolution with tier-matching + fallback chain building |
| `crypto.ts` | AES-256-GCM credential encryption/decryption |
| `rate-limit.ts` | Provider rate-limit header parsing + 429 handling |
| `status-poller.ts` | Statuspage feed polling for outage detection |
| `chain-retry.ts` | Fallback chain retry logic wrapping LLM streams |

## Invocation

```ts
import { resolveAccount } from "@/lib/accounts/resolve";

// Soft mode (default) — builds fallback chain
const result = await resolveAccount({ provider: "anthropic", tier: "senior" });

// Strict mode — no fallback, fail loud
const result = await resolveAccount({ provider: "google", strict: true });
```

## Resolution Order (soft mode)

1. Filter: enabled=true, status IN (connected, degraded), not rate-limited
2. Match tier: exact tier first, then ±1 tier with annotation
3. Provider preference: if specific provider requested, prefer it within tier
4. Auth type order: oauth_subscription > api_key > station_proxy
5. Priority tiebreaker within auth type group

## Error Modes

| Reason | Mode | Meaning |
|---|---|---|
| `strict_no_match` | strict | No account matches provider+enabled filter |
| `chain_exhausted` | soft | All tier-matched accounts unavailable |
| `rate_limited` | runtime | 429 received, account cooldown set |
| `credential_expired` | runtime | 401/403, credential needs refresh |
| `upstream_error` | runtime | 5xx from provider API |

## Blast Radius
Every LLM call path: chat, boardroom, synthesis, dispatch pre-flight.
