/**
 * status-poller.ts — Provider statuspage poller for outage detection
 * Purpose: Poll provider statuspages, detect incidents, flip account status to provider_down/degraded
 * Invocation: pollProviderStatuses() — called by /api/cron/status-poll every 2min
 * Inputs: none (reads from external statuspage feeds + nous.accounts)
 * Outputs: { ok: boolean, providers_checked: number, incidents_new: number, accounts_flipped: number }
 * Error modes: fetch_timeout (10s per feed, logged), db_error (logged), parse_error (logged)
 * Blast radius: writes to nous.provider_status_feed + nous.accounts.status
 * Version: 1.0.0
 */
import { getServiceClient } from "@/lib/supabase/server";

type PollResult = {
  ok: boolean;
  providers_checked: number;
  incidents_new: number;
  accounts_flipped: number;
  errors: string[];
};

type Incident = {
  provider: string;
  incident_id: string;
  component: string;
  severity: string;
  status: string;
  title: string;
  url: string;
  started_at: string | null;
  resolved_at: string | null;
  raw: unknown;
};

/** Provider API component names — used to filter relevant incidents */
const PROVIDER_COMPONENTS: Record<string, string[]> = {
  anthropic: ["api", "api.anthropic.com", "claude", "messages"],
  openai: ["api", "api.openai.com", "chat", "completions", "gpt"],
  google: ["vertex ai", "generative ai", "gemini", "ai platform"],
  xai: ["api", "api.x.ai", "grok", "chat"],
};

/** Fetch with timeout and retries */
async function fetchWithRetry(url: string, retries = 2, timeoutMs = 10000): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) return resp;
    } catch {
      if (attempt === retries) return null;
    }
  }
  return null;
}

/** Parse RSS feed for Anthropic/OpenAI statuspages (Atlassian Statuspage RSS format) */
function parseRSSIncidents(provider: string, xml: string): Incident[] {
  const incidents: Incident[] = [];
  // Simple XML parsing for RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                  item.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
    const guid = item.match(/<guid.*?>(.*?)<\/guid>/)?.[1] || link;
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
    const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                        item.match(/<description>(.*?)<\/description>/)?.[1] || "";

    // Determine severity from title/description keywords
    const lowerTitle = (title + " " + description).toLowerCase();
    let severity = "minor";
    if (lowerTitle.includes("major") || lowerTitle.includes("outage") || lowerTitle.includes("unavailable")) {
      severity = "major";
    } else if (lowerTitle.includes("critical") || lowerTitle.includes("complete outage")) {
      severity = "critical";
    } else if (lowerTitle.includes("maintenance") || lowerTitle.includes("scheduled")) {
      severity = "maintenance";
    }

    // Determine status from description
    let status = "investigating";
    if (lowerTitle.includes("resolved") || lowerTitle.includes("completed")) {
      status = "resolved";
    } else if (lowerTitle.includes("monitoring")) {
      status = "monitoring";
    } else if (lowerTitle.includes("identified")) {
      status = "identified";
    }

    const resolvedAt = status === "resolved" ? pubDate : null;

    incidents.push({
      provider,
      incident_id: guid,
      component: "api",
      severity,
      status,
      title,
      url: link,
      started_at: pubDate || null,
      resolved_at: resolvedAt,
      raw: { title, description, pubDate, link },
    });
  }
  return incidents;
}

/** Parse JSON incidents (Statuspage v2 format — used by xAI) */
function parseStatuspageV2Incidents(provider: string, data: { incidents?: Array<Record<string, unknown>> }): Incident[] {
  const incidents: Incident[] = [];
  for (const inc of data.incidents || []) {
    const components = (inc.components as Array<{ name?: string }>) || [];
    const componentNames = components.map((c) => (c.name || "").toLowerCase()).join(" ");
    const relevantComponents = PROVIDER_COMPONENTS[provider] || [];
    const isRelevant = relevantComponents.some((kw) => componentNames.includes(kw)) || components.length === 0;
    if (!isRelevant) continue;

    incidents.push({
      provider,
      incident_id: String(inc.id || ""),
      component: componentNames || "api",
      severity: String(inc.impact || "minor"),
      status: String(inc.status || "investigating"),
      title: String(inc.name || ""),
      url: String(inc.shortlink || ""),
      started_at: inc.started_at ? String(inc.started_at) : null,
      resolved_at: inc.resolved_at ? String(inc.resolved_at) : null,
      raw: inc,
    });
  }
  return incidents;
}

/** Parse Google Cloud incidents JSON */
function parseGoogleIncidents(data: unknown[]): Incident[] {
  const incidents: Incident[] = [];
  for (const inc of data) {
    const item = inc as Record<string, unknown>;
    const affectedProducts = (item.affected_products as Array<{ title?: string }>) || [];
    const productNames = affectedProducts.map((p) => (p.title || "").toLowerCase()).join(" ");
    const isAI = ["vertex ai", "generative ai", "gemini", "ai platform"].some((kw) => productNames.includes(kw));
    if (!isAI && affectedProducts.length > 0) continue;

    const updates = (item.updates as Array<{ status?: string; when?: string }>) || [];
    const latestUpdate = updates[0];
    const isResolved = latestUpdate?.status === "RESOLVED" || item.end ? true : false;

    incidents.push({
      provider: "google",
      incident_id: String(item.id || item.number || ""),
      component: productNames || "ai",
      severity: String(item.severity || "minor"),
      status: isResolved ? "resolved" : (latestUpdate?.status || "investigating").toLowerCase(),
      title: String(item.external_desc || item.description || ""),
      url: String(item.uri || ""),
      started_at: item.begin ? String(item.begin) : null,
      resolved_at: item.end ? String(item.end) : (isResolved && latestUpdate?.when ? String(latestUpdate.when) : null),
      raw: item,
    });
  }
  return incidents;
}

type ProviderFeed = {
  provider: string;
  url: string;
  format: "rss" | "statuspage_v2" | "google_json";
};

const FEEDS: ProviderFeed[] = [
  { provider: "anthropic", url: "https://status.anthropic.com/history.rss", format: "rss" },
  { provider: "openai", url: "https://status.openai.com/history.rss", format: "rss" },
  { provider: "google", url: "https://status.cloud.google.com/incidents.json", format: "google_json" },
  { provider: "xai", url: "https://status.x.ai/api/v2/incidents.json", format: "statuspage_v2" },
];

export async function pollProviderStatuses(): Promise<PollResult> {
  const db = getServiceClient();
  const errors: string[] = [];
  let incidentsNew = 0;
  let accountsFlipped = 0;

  for (const feed of FEEDS) {
    try {
      const resp = await fetchWithRetry(feed.url);
      if (!resp) {
        errors.push(`${feed.provider}: fetch failed (timeout or network error)`);
        continue;
      }

      let incidents: Incident[] = [];

      if (feed.format === "rss") {
        const xml = await resp.text();
        incidents = parseRSSIncidents(feed.provider, xml);
      } else if (feed.format === "statuspage_v2") {
        const json = await resp.json();
        incidents = parseStatuspageV2Incidents(feed.provider, json);
      } else if (feed.format === "google_json") {
        const json = await resp.json();
        incidents = parseGoogleIncidents(Array.isArray(json) ? json : []);
      }

      // Upsert incidents into provider_status_feed
      for (const incident of incidents.slice(0, 20)) {
        // Check if we already have this incident
        const { data: existing } = await db
          .from("provider_status_feed")
          .select("id, status, resolved_at")
          .eq("provider", incident.provider)
          .eq("incident_id", incident.incident_id)
          .limit(1);

        if (existing && existing.length > 0) {
          // Update existing
          const ex = existing[0];
          if (ex.status !== incident.status || ex.resolved_at !== incident.resolved_at) {
            await db
              .from("provider_status_feed")
              .update({
                status: incident.status,
                severity: incident.severity,
                resolved_at: incident.resolved_at,
                observed_at: new Date().toISOString(),
                raw: incident.raw,
              })
              .eq("id", ex.id);
          }
        } else {
          // Insert new
          await db.from("provider_status_feed").insert({
            provider: incident.provider,
            incident_id: incident.incident_id,
            component: incident.component,
            severity: incident.severity,
            status: incident.status,
            title: incident.title,
            url: incident.url,
            started_at: incident.started_at,
            resolved_at: incident.resolved_at,
            raw: incident.raw,
          });
          incidentsNew++;
        }
      }

      // Check for unresolved major/critical incidents affecting this provider's API
      const { data: unresolvedMajor } = await db
        .from("provider_status_feed")
        .select("id, severity, title")
        .eq("provider", feed.provider)
        .is("resolved_at", null)
        .in("severity", ["major", "critical"]);

      if (unresolvedMajor && unresolvedMajor.length > 0) {
        // Flip accounts to provider_down
        const incidentTitle = unresolvedMajor[0].title || "Active incident";
        const { data: flipped } = await db
          .from("accounts")
          .update({
            status: "provider_down",
            status_source: "statuspage",
            status_reason: incidentTitle,
          })
          .eq("provider", feed.provider)
          .eq("enabled", true)
          .neq("status", "provider_down")
          .select("id");

        accountsFlipped += (flipped || []).length;
      } else {
        // All incidents resolved — revert accounts IFF status_source='statuspage'
        const { data: reverted } = await db
          .from("accounts")
          .update({
            status: "connected",
            status_source: null,
            status_reason: null,
          })
          .eq("provider", feed.provider)
          .eq("status", "provider_down")
          .eq("status_source", "statuspage")
          .select("id");

        accountsFlipped += (reverted || []).length;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${feed.provider}: ${msg}`);
    }
  }

  return {
    ok: errors.length === 0,
    providers_checked: FEEDS.length,
    incidents_new: incidentsNew,
    accounts_flipped: accountsFlipped,
    errors,
  };
}
