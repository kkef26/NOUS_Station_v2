// Account resolver chokepoint — NST.19.7 r3 §Deliverables.4
// Every LLM call from every surface must pass through resolveAccount().
import { getServiceClient } from "@/lib/supabase/server";
import { decrypt } from "./crypto";

export type ResolveInput = {
  provider: "anthropic" | "openai" | "google" | "xai" | "station_proxy";
  auth_types?: Array<"oauth_max" | "oauth_pro" | "api_key" | "station_proxy">;
  purpose?: "chat" | "dispatch" | "embedding" | "tool_use";
};

export type ResolveOutput =
  | { ok: true; account_id: string; auth_type: string; credential: string; label: string }
  | { ok: false; error: "no_enabled_account" | "provider_unsupported"; providers_eligible: string[] };

export async function resolveAccount(input: ResolveInput): Promise<ResolveOutput> {
  const db = getServiceClient();

  const { data: rows, error } = await db
    .from("accounts")
    .select("id, provider, auth_type, display_label, credential_ref, capabilities")
    .eq("provider", input.provider)
    .eq("enabled", true)
    .eq("status", "connected")
    .order("priority", { ascending: true });

  if (error) {
    console.error("[resolveAccount] DB error:", error.message);
  }

  let accounts = rows || [];

  if (input.auth_types && input.auth_types.length > 0) {
    accounts = accounts.filter((a) =>
      input.auth_types!.includes(a.auth_type as "oauth_max" | "oauth_pro" | "api_key" | "station_proxy")
    );
  }

  if (input.purpose && accounts.length > 0) {
    accounts = accounts.filter((a) => {
      const caps = a.capabilities as Record<string, boolean> | null;
      if (!caps || Object.keys(caps).length === 0) return true;
      return caps[input.purpose!] === true;
    });
  }

  if (accounts.length === 0) {
    const { data: anyRows } = await db
      .from("accounts")
      .select("provider")
      .eq("provider", input.provider);
    const providers_eligible = anyRows
      ? Array.from(new Set(anyRows.map((r) => r.provider)))
      : [];

    await db.from("account_usage_events").insert({
      event_type: "gate_blocked",
      detail: { provider: input.provider, reason: "no_enabled_account" },
    });

    return { ok: false, error: "no_enabled_account", providers_eligible };
  }

  const account = accounts[0];

  let credential = "";
  if (account.auth_type === "station_proxy") {
    credential = "station_proxy";
  } else if (account.credential_ref) {
    credential = decrypt(account.credential_ref);
  }

  const now = new Date().toISOString();
  await Promise.all([
    db.from("account_usage_events").insert({
      account_id: account.id,
      event_type: "used",
      detail: { purpose: input.purpose ?? null },
    }),
    db.from("accounts").update({ last_used_at: now }).eq("id", account.id),
  ]);

  return {
    ok: true,
    account_id: account.id,
    auth_type: account.auth_type,
    credential,
    label: account.display_label,
  };
}
