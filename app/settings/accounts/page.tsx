"use client";

import { useState, useEffect, useCallback } from "react";

type Account = {
  id: string;
  provider: string;
  auth_type: string;
  display_label: string;
  status: string;
  enabled: boolean;
  priority: number;
  capabilities: Record<string, boolean>;
  notes: string | null;
  last_used_at: string | null;
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [newProvider, setNewProvider] = useState("");
  const [newAuthType, setNewAuthType] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCredential, setNewCredential] = useState("");
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

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

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

  const statusDot = (account: Account) => {
    if (account.status === "disconnected" || account.status === "error") {
      return "bg-red-500";
    }
    if (account.enabled) return "bg-green-500";
    return "bg-gray-400";
  };

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

      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Accounts</h1>
            <p style={{ color: "var(--ink-1)", margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
              Your LLM sources. Disabled = silent, not disconnected.
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
                    background: account.status === "disconnected" || account.status === "error"
                      ? "var(--rogue)" : account.enabled ? "var(--accent-teal)" : "var(--ink-1)",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{account.display_label}</div>
                    <div style={{ color: "var(--ink-1)", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                      {PROVIDER_LABELS[account.provider] || account.provider}
                      {" · "}
                      <span style={{
                        background: "var(--bg-2)", padding: "0.1rem 0.4rem",
                        borderRadius: "0.25rem", fontSize: "0.7rem",
                      }}>
                        {AUTH_TYPE_LABELS[account.auth_type] || account.auth_type}
                      </span>
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

                {account.notes && (
                  <p style={{ color: "var(--ink-1)", fontSize: "0.75rem", margin: "0.5rem 0 0", paddingLeft: "1.5rem" }}>
                    {account.notes}
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
                    <button key={p} onClick={() => { setNewProvider(p); setModalStep(2); }}
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
