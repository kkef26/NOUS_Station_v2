"use client";

import { useState, useEffect, useCallback } from "react";

type TierModel = {
  tier: "senior" | "mid" | "junior";
  model: string | null;
  enabled: boolean;
};

type CatalogEntry = {
  tier: string;
  model: string;
  display_name: string;
  is_default: boolean;
};

type Account = {
  id: string;
  provider: string;
  auth_type: string;
  display_label: string;
  status: string;
  enabled: boolean;
  priority: number;
  capabilities: Record<string, boolean>;
  tier_models: TierModel[];
  notes: string | null;
  last_used_at: string | null;
  rate_limit_remaining: { tokens_remaining?: number; requests_remaining?: number; reset_at?: string } | null;
  rate_limited_until: string | null;
  status_reason: string | null;
  status_source: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  station_proxy: "Station Proxy",
};

const AUTH_TYPE_LABELS: Record<string, string> = {
  oauth_max: "Claude Max",
  oauth_pro: "Claude Pro",
  api_key: "API Key",
  station_proxy: "Proxy",
};

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  senior: { label: "Senior", color: "#14B8A6" },
  mid: { label: "Mid", color: "#06B6D4" },
  junior: { label: "Junior", color: "#6B7280" },
};

function StatusBadge({ account }: { account: Account }) {
  const now = Date.now();
  const rateLimitedUntil = account.rate_limited_until ? new Date(account.rate_limited_until).getTime() : 0;
  const isRateLimited = account.status === "rate_limited" && rateLimitedUntil > now;
  const resetInMs = rateLimitedUntil - now;
  const resetMinutes = Math.ceil(resetInMs / 60000);

  if (!account.enabled) {
    return <span title="Disabled" style={{ fontSize: "0.7rem" }}>&#9898; disabled</span>;
  }

  switch (account.status) {
    case "connected":
      return <span title="Connected" style={{ color: "var(--accent-teal)", fontSize: "0.7rem" }}>&#9899; connected</span>;
    case "degraded":
      return <span title={account.status_reason || "Degraded"} style={{ color: "#eab308", fontSize: "0.7rem" }}>&#9899; degraded</span>;
    case "provider_down":
      return <span title={account.status_reason || "Provider down"} style={{ color: "var(--rogue)", fontSize: "0.7rem" }}>&#9899; provider down</span>;
    case "rate_limited":
      return (
        <span title={`Rate limited${isRateLimited ? ` — resets in ${resetMinutes}m` : ""}`} style={{ color: "#a855f7", fontSize: "0.7rem" }}>
          &#9208; rate limited{isRateLimited && ` (${resetMinutes}m)`}
        </span>
      );
    case "expired":
      return <span title="Credential expired" style={{ color: "var(--rogue)", fontSize: "0.7rem" }}>&#9899; expired</span>;
    case "error":
    case "disconnected":
      return <span title={account.status} style={{ color: "var(--rogue)", fontSize: "0.7rem" }}>&#9899; {account.status}</span>;
    default:
      return <span style={{ fontSize: "0.7rem" }}>&#9898; {account.status}</span>;
  }
}

function RateLimitInfo({ account }: { account: Account }) {
  if (!account.rate_limit_remaining) return null;
  const rl = account.rate_limit_remaining;
  if (!rl.tokens_remaining && !rl.requests_remaining) return null;

  const parts: string[] = [];
  if (rl.tokens_remaining !== undefined) {
    const k = Math.round(rl.tokens_remaining / 1000);
    parts.push(`${k}K tokens remaining`);
  }
  if (rl.requests_remaining !== undefined) {
    parts.push(`${rl.requests_remaining} req remaining`);
  }
  if (rl.reset_at) {
    const resetDate = new Date(rl.reset_at);
    const now = Date.now();
    const diffMin = Math.ceil((resetDate.getTime() - now) / 60000);
    if (diffMin > 0) parts.push(`resets in ${diffMin}m`);
  }

  return (
    <div style={{ color: "var(--ink-1)", fontSize: "0.7rem", marginTop: "0.25rem", paddingLeft: "1.5rem" }}>
      {parts.join(", ")}
    </div>
  );
}

function TierToggle({
  tier,
  enabled,
  model,
  catalogModels,
  onToggle,
  onModelChange,
}: {
  tier: "senior" | "mid" | "junior";
  enabled: boolean;
  model: string | null;
  catalogModels: CatalogEntry[];
  onToggle: () => void;
  onModelChange: (model: string | null) => void;
}) {
  const config = TIER_CONFIG[tier];
  const tierCatalog = catalogModels.filter((m) => m.tier === tier);
  const defaultModel = tierCatalog.find((m) => m.is_default);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <button
        onClick={onToggle}
        style={{
          background: enabled ? config.color : "var(--bg-2)",
          color: enabled ? "#0A0E1A" : "var(--ink-1)",
          border: "none",
          borderRadius: "0.25rem",
          padding: "0.2rem 0.5rem",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: "0.7rem",
          fontWeight: 600,
          minWidth: "56px",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        {config.label}
      </button>
      {enabled && tierCatalog.length > 0 && (
        <select
          value={model || ""}
          onChange={(e) => onModelChange(e.target.value || null)}
          style={{
            background: "var(--bg-0)",
            border: "1px solid var(--bg-2)",
            borderRadius: "0.25rem",
            color: "var(--ink-0)",
            fontFamily: "monospace",
            fontSize: "0.65rem",
            padding: "0.15rem 0.25rem",
            cursor: "pointer",
            maxWidth: "160px",
          }}
        >
          <option value="">
            {defaultModel ? `${defaultModel.display_name} (default)` : "catalog default"}
          </option>
          {tierCatalog.map((m) => (
            <option key={m.model} value={m.model}>
              {m.display_name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<Record<string, CatalogEntry[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [newProvider, setNewProvider] = useState("");
  const [newAuthType, setNewAuthType] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCredential, setNewCredential] = useState("");
  const [newTierModels, setNewTierModels] = useState<TierModel[]>([
    { tier: "mid", model: null, enabled: true },
  ]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/accounts");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts || []);
    }
    setLoading(false);
  }, []);

  const fetchCatalog = useCallback(async (provider: string) => {
    if (catalog[provider]) return;
    const res = await fetch(`/api/model_catalog?provider=${provider}`);
    if (res.ok) {
      const data = await res.json();
      setCatalog((prev) => ({ ...prev, [provider]: data }));
    }
  }, [catalog]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // Fetch catalog for each unique provider
  useEffect(() => {
    const providers = [...new Set(accounts.map((a) => a.provider))];
    providers.forEach((p) => fetchCatalog(p));
  }, [accounts, fetchCatalog]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggle = async (account: Account) => {
    const endpoint = account.enabled ? "disable" : "enable";
    const res = await fetch(`/api/accounts/${account.id}/${endpoint}`, { method: "POST" });
    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, enabled: !a.enabled } : a))
      );
      showToast(`${account.display_label} ${account.enabled ? "disabled" : "enabled"}`);
    } else {
      showToast("Failed to toggle account");
    }
  };

  const changePriority = async (account: Account, delta: number) => {
    const newPriority = account.priority + delta * 10;
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: newPriority }),
    });
    if (res.ok) {
      setAccounts((prev) =>
        prev
          .map((a) => (a.id === account.id ? { ...a, priority: newPriority } : a))
          .sort((a, b) => a.priority - b.priority)
      );
    }
  };

  const updateTierModels = async (account: Account, tierModels: TierModel[]) => {
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier_models: tierModels }),
    });
    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, tier_models: tierModels } : a))
      );
      const enabledTiers = tierModels.filter((t) => t.enabled).map((t) => TIER_CONFIG[t.tier].label);
      showToast(`${account.display_label} tiers: ${enabledTiers.join(", ") || "none"}`);
    }
  };

  const toggleAccountTier = (account: Account, tier: "senior" | "mid" | "junior") => {
    const existing = account.tier_models || [];
    const current = existing.find((tm) => tm.tier === tier);
    let updated: TierModel[];

    if (current) {
      updated = existing.map((tm) =>
        tm.tier === tier ? { ...tm, enabled: !tm.enabled } : tm
      );
    } else {
      updated = [...existing, { tier, model: null, enabled: true }];
    }

    updateTierModels(account, updated);
  };

  const setAccountTierModel = (account: Account, tier: "senior" | "mid" | "junior", model: string | null) => {
    const existing = account.tier_models || [];
    const updated = existing.map((tm) =>
      tm.tier === tier ? { ...tm, model } : tm
    );
    updateTierModels(account, updated);
  };

  const disconnect = async (account: Account) => {
    if (!confirm(`Disconnect ${account.display_label}? This will null the stored credential.`)) return;
    const res = await fetch(`/api/accounts/${account.id}/disconnect`, { method: "POST" });
    if (res.ok) {
      fetchAccounts();
      showToast(`${account.display_label} disconnected`);
    }
  };

  const deleteAccount = async (account: Account) => {
    if (!confirm(`Delete ${account.display_label}? This cannot be undone.`)) return;
    const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    if (res.status === 204) {
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      showToast(`${account.display_label} deleted`);
    }
  };

  const createAccount = async () => {
    setCreating(true);
    setError(null);
    const body: Record<string, unknown> = {
      provider: newProvider,
      auth_type: newAuthType,
      display_label: newLabel || `${PROVIDER_LABELS[newProvider] || newProvider} (${AUTH_TYPE_LABELS[newAuthType] || newAuthType})`,
      tier_models: newTierModels,
    };
    if (newAuthType === "api_key") body.credential = newCredential;

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setShowModal(false);
      setModalStep(1);
      setNewProvider("");
      setNewAuthType("");
      setNewLabel("");
      setNewCredential("");
      setNewTierModels([{ tier: "mid", model: null, enabled: true }]);
      fetchAccounts();
      showToast("Account added. Toggle it on to activate.");
    } else {
      setError(data.error || data.message || "Failed to create account");
    }
  };

  const AUTH_TYPES_BY_PROVIDER: Record<string, string[]> = {
    anthropic: ["api_key", "oauth_max", "oauth_pro"],
    openai: ["api_key"],
    google: ["api_key"],
    xai: ["api_key"],
    station_proxy: ["station_proxy"],
  };

  const getTierState = (account: Account, tier: "senior" | "mid" | "junior") => {
    const tm = (account.tier_models || []).find((t) => t.tier === tier);
    return { enabled: tm?.enabled ?? false, model: tm?.model ?? null };
  };

  const hasNoEnabledTiers = (account: Account) =>
    !account.tier_models || account.tier_models.length === 0 || !account.tier_models.some((t) => t.enabled);

  return (
    <div style={{ background: "var(--bg-0)", color: "var(--ink-0)", minHeight: "100vh", padding: "2rem" }}>
      {toast && (
        <div style={{
          position: "fixed", top: "1rem", right: "1rem", zIndex: 50,
          background: "var(--accent-teal)", color: "var(--bg-0)",
          padding: "0.75rem 1.25rem", borderRadius: "0.5rem",
          fontFamily: "monospace", fontSize: "0.875rem",
        }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: "700px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Accounts</h1>
            <p style={{ color: "var(--ink-1)", margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
              Your LLM sources. Each account can serve multiple tiers with optional model pinning.
            </p>
          </div>
          <button
            onClick={() => { setShowModal(true); setModalStep(1); }}
            style={{
              background: "var(--accent-teal)", color: "var(--bg-0)",
              border: "none", borderRadius: "0.375rem",
              padding: "0.5rem 1rem", cursor: "pointer",
              fontFamily: "monospace", fontWeight: 600, fontSize: "0.875rem",
            }}
          >
            + Add Account
          </button>
        </div>

        {loading ? (
          <p style={{ color: "var(--ink-1)" }}>Loading...</p>
        ) : accounts.length === 0 ? (
          <p style={{ color: "var(--ink-1)" }}>No accounts yet. Add one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {accounts.map((account) => (
              <div key={account.id} style={{
                background: "var(--bg-1)", border: "1px solid var(--bg-2)",
                borderRadius: "0.5rem", padding: "1rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "50%",
                    background:
                      account.status === "provider_down" || account.status === "disconnected" || account.status === "error" || account.status === "expired"
                        ? "var(--rogue)"
                        : account.status === "degraded"
                          ? "#eab308"
                          : account.status === "rate_limited"
                            ? "#a855f7"
                            : account.enabled
                              ? "var(--accent-teal)"
                              : "var(--ink-1)",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{account.display_label}</div>
                    <div style={{ color: "var(--ink-1)", fontSize: "0.75rem", marginTop: "0.125rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                      {PROVIDER_LABELS[account.provider] || account.provider}
                      {" · "}
                      <span style={{
                        background: "var(--bg-2)", padding: "0.1rem 0.4rem",
                        borderRadius: "0.25rem", fontSize: "0.7rem",
                      }}>
                        {AUTH_TYPE_LABELS[account.auth_type] || account.auth_type}
                      </span>
                      {" · "}
                      <StatusBadge account={account} />
                    </div>
                  </div>

                  {/* Priority arrows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                    <button onClick={() => changePriority(account, -1)}
                      style={{ background: "none", border: "1px solid var(--bg-2)", borderRadius: "0.25rem",
                        color: "var(--ink-1)", cursor: "pointer", padding: "0.125rem 0.375rem", fontSize: "0.7rem" }}>
                      ↑
                    </button>
                    <button onClick={() => changePriority(account, 1)}
                      style={{ background: "none", border: "1px solid var(--bg-2)", borderRadius: "0.25rem",
                        color: "var(--ink-1)", cursor: "pointer", padding: "0.125rem 0.375rem", fontSize: "0.7rem" }}>
                      ↓
                    </button>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggle(account)}
                    style={{
                      background: account.enabled ? "var(--accent-teal)" : "var(--bg-2)",
                      color: account.enabled ? "var(--bg-0)" : "var(--ink-1)",
                      border: "none", borderRadius: "0.375rem",
                      padding: "0.375rem 0.875rem", cursor: "pointer",
                      fontFamily: "monospace", fontSize: "0.8rem", fontWeight: 600,
                      minWidth: "76px",
                    }}
                  >
                    {account.enabled ? "Enabled" : "Disabled"}
                  </button>

                  {/* Kebab */}
                  <details style={{ position: "relative" }}>
                    <summary style={{
                      listStyle: "none", cursor: "pointer",
                      color: "var(--ink-1)", padding: "0.25rem 0.5rem",
                      border: "1px solid var(--bg-2)", borderRadius: "0.25rem",
                      fontSize: "1rem",
                    }}>⋮</summary>
                    <div style={{
                      position: "absolute", right: 0, top: "100%", zIndex: 10,
                      background: "var(--bg-1)", border: "1px solid var(--bg-2)",
                      borderRadius: "0.375rem", overflow: "hidden", minWidth: "140px",
                    }}>
                      {["disconnected", "error"].includes(account.status) ? null : (
                        <button onClick={() => disconnect(account)}
                          style={{ display: "block", width: "100%", padding: "0.5rem 1rem",
                            background: "none", border: "none", color: "var(--ink-0)",
                            cursor: "pointer", textAlign: "left", fontSize: "0.8rem" }}>
                          Disconnect
                        </button>
                      )}
                      <button onClick={() => deleteAccount(account)}
                        style={{ display: "block", width: "100%", padding: "0.5rem 1rem",
                          background: "none", border: "none", color: "var(--rogue)",
                          cursor: "pointer", textAlign: "left", fontSize: "0.8rem" }}>
                        Delete
                      </button>
                    </div>
                  </details>
                </div>

                {/* Tier toggles row */}
                <div style={{
                  display: "flex", gap: "0.75rem", marginTop: "0.75rem", paddingLeft: "1.5rem",
                  flexWrap: "wrap", alignItems: "center",
                }}>
                  {(["senior", "mid", "junior"] as const).map((tier) => {
                    const state = getTierState(account, tier);
                    return (
                      <TierToggle
                        key={tier}
                        tier={tier}
                        enabled={state.enabled}
                        model={state.model}
                        catalogModels={catalog[account.provider] || []}
                        onToggle={() => toggleAccountTier(account, tier)}
                        onModelChange={(model) => setAccountTierModel(account, tier, model)}
                      />
                    );
                  })}
                </div>

                {/* Warning: no enabled tiers */}
                {hasNoEnabledTiers(account) && (
                  <div style={{
                    color: "var(--rogue)", fontSize: "0.7rem", marginTop: "0.5rem",
                    paddingLeft: "1.5rem", fontFamily: "monospace",
                  }}>
                    Account is unreachable: enable at least one tier.
                  </div>
                )}

                <RateLimitInfo account={account} />

                {account.notes && (
                  <p style={{ color: "var(--ink-1)", fontSize: "0.75rem", margin: "0.5rem 0 0", paddingLeft: "1.5rem" }}>
                    {account.notes}
                  </p>
                )}

                {account.status_reason && account.status !== "connected" && (
                  <p style={{ color: "var(--ink-1)", fontSize: "0.7rem", margin: "0.25rem 0 0", paddingLeft: "1.5rem", fontStyle: "italic" }}>
                    {account.status_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Account Modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "var(--scrim)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div style={{
            background: "var(--bg-1)", border: "1px solid var(--bg-2)",
            borderRadius: "0.75rem", padding: "1.5rem", width: "100%", maxWidth: "480px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
                Add Account — Step {modalStep}/3
              </h2>
              <button onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", color: "var(--ink-1)", cursor: "pointer", fontSize: "1.25rem" }}>
                ×
              </button>
            </div>

            {modalStep === 1 && (
              <div>
                <p style={{ color: "var(--ink-1)", fontSize: "0.875rem", marginTop: 0 }}>Choose a provider:</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {["anthropic", "openai", "google", "xai", "station_proxy"].map((p) => (
                    <button key={p} onClick={() => { setNewProvider(p); setModalStep(2); fetchCatalog(p); }}
                      style={{
                        padding: "0.75rem 1rem", background: "var(--bg-2)",
                        border: "1px solid var(--bg-2)", borderRadius: "0.375rem",
                        color: "var(--ink-0)", cursor: "pointer", textAlign: "left",
                        fontFamily: "monospace", fontSize: "0.875rem",
                      }}>
                      {PROVIDER_LABELS[p] || p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modalStep === 2 && (
              <div>
                <p style={{ color: "var(--ink-1)", fontSize: "0.875rem", marginTop: 0 }}>
                  Auth type for {PROVIDER_LABELS[newProvider] || newProvider}:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {(AUTH_TYPES_BY_PROVIDER[newProvider] || ["api_key"]).map((t) => (
                    <button key={t} onClick={() => { setNewAuthType(t); setModalStep(3); }}
                      style={{
                        padding: "0.75rem 1rem", background: "var(--bg-2)",
                        border: "1px solid var(--bg-2)", borderRadius: "0.375rem",
                        color: "var(--ink-0)", cursor: "pointer", textAlign: "left",
                        fontFamily: "monospace", fontSize: "0.875rem",
                      }}>
                      {AUTH_TYPE_LABELS[t] || t}
                      {(t === "oauth_max" || t === "oauth_pro") && (
                        <span style={{ color: "var(--ink-1)", marginLeft: "0.5rem" }}>(uses API key for now)</span>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={() => setModalStep(1)}
                  style={{ marginTop: "1rem", background: "none", border: "none", color: "var(--ink-1)", cursor: "pointer", fontSize: "0.8rem" }}>
                  ← Back
                </button>
              </div>
            )}

            {modalStep === 3 && (
              <div>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", color: "var(--ink-1)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                    Label
                  </label>
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={`${PROVIDER_LABELS[newProvider]} — My Account`}
                    style={{
                      width: "100%", padding: "0.5rem 0.75rem",
                      background: "var(--bg-0)", border: "1px solid var(--bg-2)",
                      borderRadius: "0.375rem", color: "var(--ink-0)",
                      fontFamily: "monospace", fontSize: "0.875rem", boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", color: "var(--ink-1)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                    Tier Assignment
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {(["senior", "mid", "junior"] as const).map((tier) => {
                      const isEnabled = newTierModels.some((tm) => tm.tier === tier && tm.enabled);
                      const config = TIER_CONFIG[tier];
                      return (
                        <button
                          key={tier}
                          onClick={() => {
                            setNewTierModels((prev) => {
                              const existing = prev.find((tm) => tm.tier === tier);
                              if (existing) {
                                return prev.map((tm) =>
                                  tm.tier === tier ? { ...tm, enabled: !tm.enabled } : tm
                                );
                              }
                              return [...prev, { tier, model: null, enabled: true }];
                            });
                          }}
                          style={{
                            background: isEnabled ? config.color : "var(--bg-2)",
                            color: isEnabled ? "#0A0E1A" : "var(--ink-1)",
                            border: "none",
                            borderRadius: "0.25rem",
                            padding: "0.375rem 0.75rem",
                            cursor: "pointer",
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                          }}
                        >
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(newAuthType === "api_key" || newAuthType === "oauth_max" || newAuthType === "oauth_pro") && (
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", color: "var(--ink-1)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                      API Key
                    </label>
                    <input
                      type="password"
                      value={newCredential}
                      onChange={(e) => setNewCredential(e.target.value)}
                      placeholder="sk-ant-..."
                      style={{
                        width: "100%", padding: "0.5rem 0.75rem",
                        background: "var(--bg-0)", border: "1px solid var(--bg-2)",
                        borderRadius: "0.375rem", color: "var(--ink-0)",
                        fontFamily: "monospace", fontSize: "0.875rem", boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}

                {newAuthType === "station_proxy" && (
                  <p style={{ color: "var(--ink-1)", fontSize: "0.8rem" }}>
                    Station Proxy routes via EC2 (54.86.33.89). No credential needed.
                  </p>
                )}

                {error && (
                  <p style={{ color: "var(--rogue)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{error}</p>
                )}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button onClick={() => setModalStep(2)}
                    style={{ flex: 1, padding: "0.5rem", background: "none", border: "1px solid var(--bg-2)",
                      borderRadius: "0.375rem", color: "var(--ink-1)", cursor: "pointer", fontFamily: "monospace" }}>
                    ← Back
                  </button>
                  <button
                    onClick={() => {
                      const authType = (newAuthType === "oauth_max" || newAuthType === "oauth_pro")
                        ? "api_key"
                        : newAuthType;
                      setNewAuthType(authType);
                      createAccount();
                    }}
                    disabled={creating || ((newAuthType === "api_key" || newAuthType === "oauth_max" || newAuthType === "oauth_pro") && !newCredential)}
                    style={{
                      flex: 2, padding: "0.5rem",
                      background: "var(--accent-teal)", color: "var(--bg-0)",
                      border: "none", borderRadius: "0.375rem",
                      cursor: creating ? "not-allowed" : "pointer",
                      fontFamily: "monospace", fontWeight: 600,
                      opacity: creating ? 0.7 : 1,
                    }}
                  >
                    {creating ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
