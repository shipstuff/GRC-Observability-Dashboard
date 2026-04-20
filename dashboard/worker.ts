import { Hono } from "hono";
import { parse } from "yaml";
import type { Manifest, } from "../scanner/types.js";
import { evaluateFramework } from "../scanner/generators/framework-report.js";
import { evaluateEUAIAct, calcAIComplianceScore } from "../scanner/frameworks/eu-ai-act.js";
import { assessRisks } from "../scanner/generators/risk-assessment.js";
import { generateJsonExport } from "../scanner/generators/exports/json.js";
import { generateCsvNistCsf, generateCsvEuAiAct, generateCsvRisks, generateCsvVulnerabilities } from "../scanner/generators/exports/csv.js";
import { concatCsv } from "../scanner/generators/exports/concat.js";
import { generateSarifExport } from "../scanner/generators/exports/sarif.js";
import { generateOscalExport } from "../scanner/generators/exports/oscal.js";
import { renderDashboard, renderRepoDetail, renderNistView, renderBranchComparison, renderTrendChart, renderAIComplianceView, renderInventoryView } from "./views/render.js";
import { verifyGitHubOidc, assertRepositoryMatches, AuthError, DEFAULT_AUDIENCE } from "./auth.js";

type Bindings = {
  GRC_KV: KVNamespace;
  ORG_NAME?: string;
  /**
   * Override the expected OIDC audience for forked deployments. Defaults to
   * "grc-dashboard". Forks should set this to something deployment-specific
   * so a token minted for one dashboard can't be replayed against another.
   */
  GRC_AUDIENCE?: string;
  /**
   * When set to "1", skips OIDC verification on POST endpoints. Intended for
   * local `wrangler dev` iteration only — never set in production.
   */
  GRC_AUTH_BYPASS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const BADGE_LABEL = "grc observability";

// --- Types ---

export interface RepoSummary {
  repo: string;
  branch: string;
  commit: string;
  scanDate: string;
  dataCollectionCount: number;
  thirdPartyCount: number;
  secretsDetected: boolean;
  headersPresent: number;
  headersTotal: number;
  httpsEnforced: boolean | null;
  certExpiry: string | null;
  criticalVulns: number;
  highVulns: number;
  complianceScore: number;
  nistScore: number;
  nistResults: ReturnType<typeof evaluateFramework>;
  artifacts: Manifest["artifacts"];
  aiScore: number;
  aiSystemCount: number;
  aiHighRiskCount: number;
  siteUrl?: string;
}

export interface FunctionScore {
  name: string;
  percentage: number;
  passed: number;
  partial: number;
  failed: number;
}

export interface HistoryEntry {
  repo: string;
  branch: string;
  commit: string;
  scanDate: string;
  complianceScore: number;
  nistScore: number;
  criticalVulns: number;
  highVulns: number;
  headersPresent: number;
  headersTotal: number;
  aiScore?: number;
  aiSystemCount?: number;
}

/**
 * States for whether a policy URL is actually being served on the live site.
 * Distinct from the in-repo artifact state (which lives on `manifest.artifacts`).
 */
export type PolicyServedState = "served" | "unreachable" | "not-configured";

export type PolicyServedMap = Partial<Record<
  "privacyPolicy" | "termsOfService" | "vulnerabilityDisclosure" | "incidentResponsePlan" | "securityTxt",
  PolicyServedState
>>;

/**
 * The KV value we store per (repo, branch). Kept as a named type so the same
 * shape doesn't get spelled out inline five times.
 *
 * `policyServed` + `policyServedCheckedAt` are populated when the user hits
 * the Check Production button. They are distinct from `manifest.artifacts`
 * (which the scanner sets and describes in-repo file state).
 */
export interface StoredManifest {
  manifest: Manifest;
  receivedAt: string;
  siteUrl?: string;
  policyServed?: PolicyServedMap;
  policyServedCheckedAt?: string;
}

// --- KV helpers ---

async function getManifests(kv: KVNamespace): Promise<(StoredManifest & { key: string })[]> {
  const list = await kv.list({ prefix: "manifest:" });
  const results: (StoredManifest & { key: string })[] = [];
  for (const key of list.keys) {
    const val = await kv.get(key.name, "json") as StoredManifest | null;
    if (val) results.push({ key: key.name, ...val });
  }
  return results;
}

async function getHistory(kv: KVNamespace, repo: string, branch?: string): Promise<HistoryEntry[]> {
  const key = `history:${repo}`;
  const val = await kv.get(key, "json") as HistoryEntry[] | null;
  const all = val ?? [];
  if (branch) return all.filter(h => h.branch === branch);
  return all;
}

async function appendHistory(kv: KVNamespace, repo: string, entry: HistoryEntry) {
  const key = `history:${repo}`;
  const existing = await getHistory(kv, repo);
  existing.push(entry);
  await kv.put(key, JSON.stringify(existing.slice(-500)));
}

async function getManifestEntry(kv: KVNamespace, repo: string, branch?: string) {
  const branchesToTry = branch ? [branch] : ["main", "master"];
  for (const candidate of branchesToTry) {
    const key = `manifest:${repo}:${candidate}`;
    const entry = await kv.get(key, "json") as StoredManifest | null;
    if (entry) return entry;
  }
  if (!branch) {
    // Repos that use a non-main/master default branch: scan keys scoped to
    // THIS repo only. Using the full prefix keeps this O(branches-for-repo)
    // instead of O(all-manifests-in-KV), which matters because /badge is a
    // public endpoint hit frequently from README images — an unscoped fallback
    // turns cache misses (typos, unknown repos) into expensive KV reads.
    const scoped = await kv.list({ prefix: `manifest:${repo}:` });
    if (scoped.keys.length === 0) return null;
    // Prefer main/master if they somehow appear here (shouldn't — we already
    // tried them above), then fall back to the first key. Fetch exactly one.
    const preferred = scoped.keys.find(k => k.name.endsWith(":main") || k.name.endsWith(":master"))
      ?? scoped.keys[0];
    return await kv.get(preferred.name, "json") as StoredManifest | null;
  }
  return null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function badgeSegmentWidth(text: string): number {
  return Math.max(42, text.length * 7 + 18);
}

function renderBadge(label: string, message: string, color: string): string {
  const labelWidth = badgeSegmentWidth(label);
  const messageWidth = badgeSegmentWidth(message);
  const totalWidth = labelWidth + messageWidth;
  const labelTextX = Math.round(labelWidth / 2);
  const messageTextX = labelWidth + Math.round(messageWidth / 2);
  const safeLabel = escapeXml(label);
  const safeMessage = escapeXml(message);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${safeLabel}: ${safeMessage}">
  <title>${safeLabel}: ${safeMessage}</title>
  <linearGradient id="smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="clip">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#clip)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#smooth)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelTextX}" y="15" fill="#010101" fill-opacity=".3">${safeLabel}</text>
    <text x="${labelTextX}" y="14">${safeLabel}</text>
    <text x="${messageTextX}" y="15" fill="#010101" fill-opacity=".3">${safeMessage}</text>
    <text x="${messageTextX}" y="14">${safeMessage}</text>
  </g>
</svg>`;
}

function badgeState(summary: RepoSummary | null): { message: string; color: string } {
  if (!summary) {
    return { message: "not scanned", color: "#6e7781" };
  }

  if (summary.secretsDetected || summary.criticalVulns > 0 || summary.complianceScore < 50) {
    return { message: `fail ${summary.complianceScore}%`, color: "#d1242f" };
  }

  const headerGap = summary.headersTotal > 0 && summary.headersPresent < summary.headersTotal;
  if (summary.highVulns > 0 || !summary.httpsEnforced || headerGap || summary.complianceScore < 80) {
    return { message: `warn ${summary.complianceScore}%`, color: "#bc4c00" };
  }

  return { message: `pass ${summary.complianceScore}%`, color: "#2da44e" };
}

function parseRepoQuery(repo: string | undefined): string | null {
  if (!repo) return null;
  const normalized = repo.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized || !normalized.includes("/")) return null;
  return normalized;
}

// --- Scoring ---

function calcNistScore(results: ReturnType<typeof evaluateFramework>): number {
  const applicable = results.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const partial = applicable.filter(r => r.status === "partial").length;
  return applicable.length > 0 ? Math.round(((passed + partial * 0.5) / applicable.length) * 100) : 0;
}

export function getNistFunctionScores(results: ReturnType<typeof evaluateFramework>): FunctionScore[] {
  return ["Govern", "Identify", "Protect", "Detect", "Respond", "Recover"].map(fn => {
    const controls = results.filter(r => r.control.function === fn);
    const applicable = controls.filter(r => r.status !== "not-applicable");
    const passed = applicable.filter(r => r.status === "pass").length;
    const partial = applicable.filter(r => r.status === "partial").length;
    const failed = applicable.filter(r => r.status === "fail").length;
    const pct = applicable.length > 0 ? Math.round(((passed + partial * 0.5) / applicable.length) * 100) : 100;
    return { name: fn, percentage: pct, passed, partial, failed };
  });
}

function summarize(manifest: Manifest, siteUrl?: string): RepoSummary {
  const headers = manifest.securityHeaders;
  const headersPresent = headers ? Object.values(headers).filter(v => v === "present").length : 0;
  const headersTotal = headers ? Object.keys(headers).length : 0;

  let score = 0, checks = 0;
  checks++; if (!manifest.secretsScan.detected) score++;
  if (headers) { checks += headersTotal; score += headersPresent; }
  if (manifest.https) { checks++; if (manifest.https.enforced) score++; }
  if (manifest.dependencies) { checks++; if (manifest.dependencies.criticalVulnerabilities === 0 && manifest.dependencies.highVulnerabilities === 0) score++; }
  // Artifact states are "present" | "generated" | "manual" | "missing" |
  // "not-applicable" (the last one added in Phase 8 for AI artifacts). Only
  // in-scope artifacts contribute — "not-applicable" is excluded from BOTH
  // numerator and denominator so repos without AI systems don't get three
  // free passes for AI-artifact fields and artificially inflate their score.
  const artifactValues = Object.values(manifest.artifacts).filter(v => v !== undefined && v !== "not-applicable");
  checks += artifactValues.length; score += artifactValues.filter(v => v !== "missing").length;
  if (manifest.accessControls.branchProtection !== null) { checks++; if (manifest.accessControls.branchProtection) score++; }

  const nistResults = evaluateFramework(manifest);
  const aiResults = evaluateEUAIAct(manifest);
  const aiScore = calcAIComplianceScore(aiResults);
  const aiSystems = manifest.aiSystems || [];
  const aiHighRiskCount = aiSystems.filter(s => s.riskTier === "high" || s.riskTier === "prohibited").length;

  return {
    repo: manifest.repo, branch: manifest.branch, commit: manifest.commit, scanDate: manifest.scanDate,
    dataCollectionCount: manifest.dataCollection.length, thirdPartyCount: manifest.thirdPartyServices.length,
    secretsDetected: manifest.secretsScan.detected, headersPresent, headersTotal,
    httpsEnforced: manifest.https?.enforced ?? null, certExpiry: manifest.https?.certExpiry ?? null,
    criticalVulns: manifest.dependencies?.criticalVulnerabilities ?? 0,
    highVulns: manifest.dependencies?.highVulnerabilities ?? 0,
    complianceScore: checks > 0 ? Math.round((score / checks) * 100) : 0,
    nistScore: calcNistScore(nistResults), nistResults, artifacts: manifest.artifacts,
    aiScore, aiSystemCount: aiSystems.length, aiHighRiskCount, siteUrl,
  };
}

function preferMain(entries: StoredManifest[]) {
  if (entries.length === 0) return null;
  return entries.find(e => e.manifest.branch === "main" || e.manifest.branch === "master") || entries[0];
}

function findByBranch(entries: StoredManifest[], branch?: string) {
  if (!branch) return preferMain(entries);
  return entries.find(e => e.manifest.branch === branch) || preferMain(entries);
}

// --- API ---

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "grc-observability-dashboard",
    timestamp: new Date().toISOString(),
    badgeEndpoint: "/badge?repo=owner/name",
  });
});

app.get("/badge", async (c) => {
  const repo = parseRepoQuery(c.req.query("repo"));
  if (!repo) return c.json({ error: "Query param 'repo' must be 'owner/name'" }, 400);

  const branch = c.req.query("branch") || undefined;
  const entry = await getManifestEntry(c.env.GRC_KV, repo, branch);
  const summary = entry ? summarize(entry.manifest, entry.siteUrl) : null;
  const { message, color } = badgeState(summary);

  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(renderBadge(BADGE_LABEL, message, color));
});

app.get("/badge/:owner/:name", async (c) => {
  const repo = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || undefined;
  const entry = await getManifestEntry(c.env.GRC_KV, repo, branch);
  const summary = entry ? summarize(entry.manifest, entry.siteUrl) : null;
  const { message, color } = badgeState(summary);

  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(renderBadge(BADGE_LABEL, message, color));
});

app.post("/api/report", async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";
    let manifest: Manifest;
    if (contentType.includes("yaml")) {
      manifest = parse(await c.req.text()) as Manifest;
    } else {
      manifest = await c.req.json() as Manifest;
    }
    if (!manifest.repo || !manifest.scanDate) return c.json({ error: "Invalid manifest" }, 400);

    // OIDC verification — required unless GRC_AUTH_BYPASS is explicitly set
    // for local development. The JWT must have been minted by GitHub for the
    // same repository that's claiming to submit the manifest.
    if (c.env.GRC_AUTH_BYPASS !== "1") {
      try {
        const audience = c.env.GRC_AUDIENCE || DEFAULT_AUDIENCE;
        const claims = await verifyGitHubOidc(c.req.header("authorization"), audience);
        assertRepositoryMatches(claims, manifest.repo);
      } catch (e) {
        if (e instanceof AuthError) return c.json({ error: e.message }, e.status as any);
        throw e;
      }
    }

    // Merge with existing data — preserve live check results (headers, TLS) if new scan is static-only
    const siteUrl = c.req.query("site_url") || "";
    const kvKey = `manifest:${manifest.repo}:${manifest.branch}`;
    const existing = await c.env.GRC_KV.get(kvKey, "json") as StoredManifest | null;

    // Defensive: legacy manifests may not have some fields. Fill them in.
    if (!manifest.artifacts) {
      manifest.artifacts = {
        privacyPolicy: "missing", termsOfService: "missing", securityTxt: "missing",
        vulnerabilityDisclosure: "missing", incidentResponsePlan: "missing",
      };
    }

    if (existing) {
      // If new scan has no security headers but old one does, preserve the old live data
      if (!manifest.securityHeaders && existing.manifest.securityHeaders) {
        manifest.securityHeaders = existing.manifest.securityHeaders;
      }
      if (!manifest.https && existing.manifest.https) {
        manifest.https = existing.manifest.https;
      }
      // Only fall back to existing policyUrls if the incoming manifest is
      // MISSING the field entirely (legacy scanner). A present-but-empty
      // policyUrls object means the user explicitly opted out — respect that.
      if (manifest.policyUrls === undefined && existing.manifest.policyUrls) {
        manifest.policyUrls = existing.manifest.policyUrls;
      }
    }

    const storedSiteUrl = siteUrl || existing?.siteUrl || "";
    await c.env.GRC_KV.put(kvKey, JSON.stringify({ manifest, receivedAt: new Date().toISOString(), siteUrl: storedSiteUrl }));

    const summary = summarize(manifest);
    await appendHistory(c.env.GRC_KV, manifest.repo, {
      repo: manifest.repo, branch: manifest.branch, commit: manifest.commit,
      scanDate: manifest.scanDate, complianceScore: summary.complianceScore,
      nistScore: summary.nistScore, criticalVulns: summary.criticalVulns,
      highVulns: summary.highVulns, headersPresent: summary.headersPresent,
      headersTotal: summary.headersTotal,
      aiScore: summary.aiScore, aiSystemCount: summary.aiSystemCount,
    });

    return c.json({ status: "ok", repo: manifest.repo, branch: manifest.branch });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Check production — hit live URL, update security headers and TLS in the stored manifest
app.post("/api/check-production/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || "main";
  const kvKey = `manifest:${repoName}:${branch}`;
  const stored = await c.env.GRC_KV.get(kvKey, "json") as StoredManifest | null;

  if (!stored) return c.json({ error: "Repo not found" }, 404);

  const siteUrl = stored.siteUrl || c.req.query("url");
  if (!siteUrl) return c.json({ error: "No site_url configured for this repo" }, 400);

  try {
    const base = siteUrl.replace(/\/$/, "");

    // Check security headers on the root URL
    const response = await fetch(siteUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
    const h = response.headers;

    stored.manifest.securityHeaders = {
      csp: h.has("content-security-policy") ? "present" : h.has("content-security-policy-report-only") ? "partial" : "missing",
      hsts: h.has("strict-transport-security") ? "present" : "missing",
      xFrameOptions: h.has("x-frame-options") ? "present" : "missing",
      xContentTypeOptions: h.has("x-content-type-options") ? "present" : "missing",
      referrerPolicy: h.has("referrer-policy") ? "present" : "missing",
      permissionsPolicy: h.has("permissions-policy") ? "present" : "missing",
    };

    // Check HTTPS enforcement
    try {
      const url = new URL(siteUrl);
      const httpUrl = `http://${url.hostname}`;
      const httpResp = await fetch(httpUrl, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
      const location = httpResp.headers.get("location");
      const enforced = httpResp.status >= 300 && httpResp.status < 400 && (location?.startsWith("https://") ?? false);
      stored.manifest.https = { enforced, certExpiry: stored.manifest.https?.certExpiry ?? null };
    } catch {
      stored.manifest.https = { enforced: true, certExpiry: stored.manifest.https?.certExpiry ?? null };
    }

    // Check configured policy URLs. Only verify URLs the user has explicitly
    // set in .grc/config.yml under policy_urls. If a URL isn't configured,
    // we simply don't check it — no false negatives.
    const policyUrls = stored.manifest.policyUrls || {};
    const resolveUrl = (pathOrUrl: string): string => {
      if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
      return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : "/" + pathOrUrl}`;
    };
    const checkServed = async (url: string): Promise<boolean> => {
      try {
        const r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
        return r.ok;
      } catch {
        return false;
      }
    };

    const policyServed: PolicyServedMap = {
      privacyPolicy: "not-configured",
      termsOfService: "not-configured",
      vulnerabilityDisclosure: "not-configured",
      incidentResponsePlan: "not-configured",
      securityTxt: "not-configured",
    };

    const checks: Array<Promise<void>> = [];
    for (const key of Object.keys(policyServed) as Array<keyof PolicyServedMap>) {
      const configuredUrl = policyUrls[key as keyof typeof policyUrls];
      if (!configuredUrl) continue;
      checks.push(
        checkServed(resolveUrl(configuredUrl)).then(ok => {
          policyServed[key] = ok ? "served" : "unreachable";
        })
      );
    }
    await Promise.all(checks);

    // We DON'T update manifest.artifacts here. That field reflects repo state
    // (does the policy file exist at outputDir?), set by the scanner. Live
    // servability is a separate concept stored on the StoredManifest envelope
    // so the UI can render both independently and show a freshness timestamp.
    stored.policyServed = policyServed;
    stored.policyServedCheckedAt = new Date().toISOString();

    stored.manifest.scanDate = new Date().toISOString();
    await c.env.GRC_KV.put(kvKey, JSON.stringify(stored));

    const summary = summarize(stored.manifest);
    await appendHistory(c.env.GRC_KV, repoName, {
      repo: repoName, branch, commit: stored.manifest.commit,
      scanDate: stored.manifest.scanDate, complianceScore: summary.complianceScore,
      nistScore: summary.nistScore, criticalVulns: summary.criticalVulns,
      highVulns: summary.highVulns, headersPresent: summary.headersPresent,
      headersTotal: summary.headersTotal,
      aiScore: summary.aiScore, aiSystemCount: summary.aiSystemCount,
    });

    return c.json({
      status: "ok",
      headersPresent: summary.headersPresent,
      headersTotal: summary.headersTotal,
      httpsEnforced: summary.httpsEnforced,
      policyUrls: policyUrls,
      policyServed,
    });
  } catch (e: any) {
    return c.json({ error: `Could not reach ${siteUrl}: ${e.message}` }, 502);
  }
});

app.get("/api/repos", async (c) => {
  const all = await getManifests(c.env.GRC_KV);
  const summaries = all.map(m => { const { nistResults, ...rest } = summarize(m.manifest); return rest; });
  return c.json(summaries);
});

app.get("/api/repos/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const entry = preferMain(all.filter(m => m.manifest.repo === repoName));
  if (!entry) return c.json({ error: "Repo not found" }, 404);
  return c.json(entry.manifest);
});

app.get("/api/history/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch");
  const history = await getHistory(c.env.GRC_KV, repoName, branch || undefined);
  return c.json(history);
});

app.get("/api/branches/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const branches = all.filter(m => m.manifest.repo === repoName).map(m => m.manifest.branch);
  return c.json(branches);
});

// --- UI ---

app.get("/", async (c) => {
  const all = await getManifests(c.env.GRC_KV);

  // Group by repo, prefer main/master for the repo card
  const byRepo = new Map<string, typeof all[number]>();
  for (const entry of all) {
    const repo = entry.manifest.repo;
    const existing = byRepo.get(repo);
    if (!existing) {
      byRepo.set(repo, entry);
    } else {
      const isMain = entry.manifest.branch === "main" || entry.manifest.branch === "master";
      const existingIsMain = existing.manifest.branch === "main" || existing.manifest.branch === "master";
      if (isMain && !existingIsMain) byRepo.set(repo, entry);
    }
  }

  // Get all branches per repo for the dropdown
  const branchesPerRepo = new Map<string, string[]>();
  for (const entry of all) {
    const repo = entry.manifest.repo;
    const branches = branchesPerRepo.get(repo) || [];
    if (!branches.includes(entry.manifest.branch)) branches.push(entry.manifest.branch);
    branchesPerRepo.set(repo, branches);
  }

  const entries = [...byRepo.values()];
  const summaries = entries.map(m => summarize(m.manifest, m.siteUrl));

  // Sort by most recent scan
  summaries.sort((a, b) => new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime());

  // v2 two-pane: server-render the right detail pane for the selected repo
  // (from ?repo=owner/name). Defaults to the freshest repo so users land on
  // something useful instead of an empty state. `?tab=` picks the content
  // inside the detail pane.
  const repoQuery = parseRepoQuery(c.req.query("repo"));
  const selectedRepo = (repoQuery && summaries.find(s => s.repo === repoQuery))
    ? repoQuery
    : summaries[0]?.repo;
  const selectedEntry = selectedRepo ? entries.find(e => e.manifest.repo === selectedRepo) : undefined;

  const validTabs = new Set(["overview", "nist", "ai", "branches", "trends"]);
  const rawTab = c.req.query("tab");
  const tab: "overview" | "nist" | "ai" | "branches" | "trends" =
    rawTab && validTabs.has(rawTab) ? (rawTab as any) : "overview";

  let repoDetailHtml: string | undefined;
  if (selectedEntry && selectedRepo) {
    const detailSummary = summarize(selectedEntry.manifest, selectedEntry.siteUrl);
    const detailOpts: Parameters<typeof renderRepoDetail>[3] = { tab };
    if (tab === "nist") {
      detailOpts.functionScores = getNistFunctionScores(detailSummary.nistResults);
    } else if (tab === "branches") {
      detailOpts.branchSummaries = all
        .filter(e => e.manifest.repo === selectedRepo)
        .map(e => summarize(e.manifest, e.siteUrl));
    } else if (tab === "trends") {
      detailOpts.history = await getHistory(c.env.GRC_KV, selectedRepo, selectedEntry.manifest.branch);
    }
    repoDetailHtml = renderRepoDetail(
      selectedEntry.manifest,
      detailSummary,
      { policyServed: selectedEntry.policyServed, policyServedCheckedAt: selectedEntry.policyServedCheckedAt },
      detailOpts,
    );
  }

  const orgName = c.env.ORG_NAME || "";
  return c.html(renderDashboard(summaries, branchesPerRepo, orgName, { selectedRepo, repoDetailHtml }));
});

app.get("/repo/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || undefined;
  const all = await getManifests(c.env.GRC_KV);
  const entry = findByBranch(all.filter(m => m.manifest.repo === repoName), branch);
  if (!entry) return c.html("<p>REPO NOT FOUND</p>", 404);
  return c.html(renderRepoDetail(
    entry.manifest,
    summarize(entry.manifest, entry.siteUrl),
    { policyServed: entry.policyServed, policyServedCheckedAt: entry.policyServedCheckedAt },
  ));
});

app.get("/nist/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || undefined;
  const all = await getManifests(c.env.GRC_KV);
  const entry = findByBranch(all.filter(m => m.manifest.repo === repoName), branch);
  if (!entry) return c.html("<p>REPO NOT FOUND</p>", 404);
  const summary = summarize(entry.manifest);
  return c.html(renderNistView(summary, getNistFunctionScores(summary.nistResults)));
});

app.get("/branches/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const entries = all.filter(m => m.manifest.repo === repoName);
  if (entries.length === 0) return c.html("<p>NO BRANCHES FOUND</p>", 404);
  return c.html(renderBranchComparison(entries.map(e => summarize(e.manifest))));
});

app.get("/trends/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || "main";
  const history = await getHistory(c.env.GRC_KV, repoName, branch);
  return c.html(renderTrendChart(history, repoName, branch));
});

app.get("/ai/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || undefined;
  const all = await getManifests(c.env.GRC_KV);
  const entry = findByBranch(all.filter(m => m.manifest.repo === repoName), branch);
  if (!entry) return c.html("<p>REPO NOT FOUND</p>", 404);
  return c.html(renderAIComplianceView(entry.manifest));
});

function buildInventoryRows(all: { manifest: Manifest }[]): Array<{
  repo: string; branch: string; scanDate: string;
  provider: string; sdk: string; category: string; location: string;
  riskTier: string; riskTierSource: string; euMarket: boolean; riskReasoning?: string;
}> {
  // Prefer main/master if the repo has one, else the first scanned branch.
  // Inventory reflects the state of the default branch — feature branches
  // are intentionally excluded so the list doesn't churn every PR.
  const byRepo = new Map<string, { manifest: Manifest }>();
  for (const entry of all) {
    const repo = entry.manifest.repo;
    const existing = byRepo.get(repo);
    const isMain = entry.manifest.branch === "main" || entry.manifest.branch === "master";
    if (!existing || isMain) byRepo.set(repo, entry);
  }

  const rows: ReturnType<typeof buildInventoryRows> = [];
  for (const entry of byRepo.values()) {
    for (const s of entry.manifest.aiSystems || []) {
      rows.push({
        repo: entry.manifest.repo,
        branch: entry.manifest.branch,
        scanDate: entry.manifest.scanDate,
        provider: s.provider,
        sdk: s.sdk,
        category: s.category,
        location: s.location,
        riskTier: s.riskTier || "unknown",
        riskTierSource: s.riskTierSource || "heuristic",
        euMarket: s.euMarket === true,
        riskReasoning: s.riskReasoning,
      });
    }
  }

  // Sort: prohibited and high-risk first (most actionable), then by provider.
  const tierRank: Record<string, number> = { prohibited: 0, high: 1, limited: 2, minimal: 3, unknown: 4 };
  rows.sort((a, b) => {
    const ta = tierRank[a.riskTier] ?? 5;
    const tb = tierRank[b.riskTier] ?? 5;
    if (ta !== tb) return ta - tb;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.repo.localeCompare(b.repo);
  });
  return rows;
}

app.get("/inventory", async (c) => {
  const all = await getManifests(c.env.GRC_KV);
  const rows = buildInventoryRows(all);
  const orgName = (c.env.ORG_NAME || "").trim();
  return c.html(renderInventoryView(rows, orgName));
});

app.get("/api/inventory.csv", async (c) => {
  const all = await getManifests(c.env.GRC_KV);
  const rows = buildInventoryRows(all);
  const esc = (s: string | undefined) => {
    if (s === undefined) return "";
    const needsQuote = /[",\n]/.test(s);
    const escaped = s.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
  };
  const header = "repo,branch,scan_date,provider,sdk,category,location,risk_tier,risk_tier_source,eu_market,risk_reasoning";
  const body = rows.map(r => [
    r.repo, r.branch, r.scanDate, r.provider, r.sdk, r.category, r.location,
    r.riskTier, r.riskTierSource, r.euMarket ? "true" : "false", r.riskReasoning ?? "",
  ].map(esc).join(",")).join("\n");
  return new Response(header + "\n" + body + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ai-systems-inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

// ─── Phase 9 Sub-phase A: machine-readable exports ─────────────────────────

/**
 * Compute the framework + risk artifacts for one manifest. The scanner itself
 * passes authFindings (source-level auth middleware misses) into assessRisks,
 * but those aren't stored in the manifest so we call assessRisks with []
 * here. The risk set is nearly identical — only file-specific auth misses
 * drop out.
 */
function exportPayload(manifest: Manifest, siteUrl: string | undefined) {
  const nist = evaluateFramework(manifest);
  const eu = evaluateEUAIAct(manifest);
  const config = {
    siteName: manifest.repo,
    siteUrl: siteUrl ?? "",
    ownerName: manifest.repo.split("/")[0] ?? "Unknown",
    contactEmail: "",
    securityContact: "",
    logRetentionDays: 90,
    jurisdiction: ["gdpr"],
    preferredLanguages: ["en"],
    outputDir: "docs/policies",
    policyUrls: {},
    ai: { enabled: false, provider: "anthropic" as const },
    aiSystemOverrides: [],
  };
  const risks = assessRisks(manifest, config, []);
  return { nist, eu, risks };
}

function stemFor(manifest: Manifest): string {
  const safeBranch = manifest.branch.replace(/[^\w.-]/g, "-");
  return `${manifest.repo.replace(/\//g, "-")}-${safeBranch}-${manifest.commit.slice(0, 7)}`;
}

function download(body: string, filename: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

// Per-repo exports — honor the ?branch=<name> query param so consumers can
// download the state of any scanned branch, not just main. Falls back to the
// repo's default (main/master/first-scanned) via findByBranch.
app.get("/export/:owner/:name/:format{.+}", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const format = c.req.param("format");
  const branch = c.req.query("branch") || undefined;
  const all = await getManifests(c.env.GRC_KV);
  const entry = findByBranch(all.filter(m => m.manifest.repo === repoName), branch);
  if (!entry) return c.json({ error: "Repo not found" }, 404);

  const { manifest, siteUrl } = entry;
  const { nist, eu, risks } = exportPayload(manifest, siteUrl);
  const stem = stemFor(manifest);

  switch (format) {
    case "manifest.json":
      return download(generateJsonExport(manifest, nist, eu, risks), `${stem}.json`, "application/json; charset=utf-8");
    case "findings.sarif":
      return download(generateSarifExport(manifest), `${stem}.sarif`, "application/sarif+json; charset=utf-8");
    case "assessment.oscal.json":
      return download(generateOscalExport(manifest, nist, eu), `${stem}.oscal.json`, "application/json; charset=utf-8");
    case "nist-csf.csv":
      return download(generateCsvNistCsf(manifest, nist), `${stem}-nist-csf.csv`, "text/csv; charset=utf-8");
    case "eu-ai-act.csv":
      return download(generateCsvEuAiAct(manifest, eu), `${stem}-eu-ai-act.csv`, "text/csv; charset=utf-8");
    case "risks.csv":
      return download(generateCsvRisks(manifest, risks), `${stem}-risks.csv`, "text/csv; charset=utf-8");
    case "vulnerabilities.csv":
      return download(generateCsvVulnerabilities(manifest), `${stem}-vulnerabilities.csv`, "text/csv; charset=utf-8");
    default:
      return c.json({ error: `Unknown export format: ${format}. Try manifest.json, findings.sarif, assessment.oscal.json, nist-csf.csv, eu-ai-act.csv, risks.csv, vulnerabilities.csv.` }, 400);
  }
});

/**
 * Pick the main/master entry for each repo — the org-level export is an
 * "audit bundle" so we deliberately leave feature branches out.
 *
 * If a repo has no main/master manifest in KV (e.g. only feature-branch
 * scans have landed so far), it is excluded entirely rather than silently
 * substituting an arbitrary branch. The endpoint's documented semantics
 * are "main/master only"; the audit bundle must honor that literally or
 * it leaks WIP state into what auditors believe is production evidence.
 */
function mainEntryPerRepo(all: StoredManifest[]): StoredManifest[] {
  const byRepo = new Map<string, StoredManifest>();
  for (const entry of all) {
    const repo = entry.manifest.repo;
    const isMain = entry.manifest.branch === "main" || entry.manifest.branch === "master";
    if (!isMain) continue;
    const existing = byRepo.get(repo);
    // Prefer "main" over "master" if a repo somehow has both. Otherwise
    // just keep whichever we saw first; main and master aren't both
    // expected in the same repo.
    if (!existing || entry.manifest.branch === "main") {
      byRepo.set(repo, entry);
    }
  }
  return [...byRepo.values()];
}

// Org-level aggregate — main/master only across all repos. JSON + 4 CSVs.
// SARIF + OSCAL aggregation is skipped for now; they require careful merge
// semantics (dedup of common rules, UUID stability) and nobody's asked.
app.get("/export/all/:format{.+}", async (c) => {
  const all = await getManifests(c.env.GRC_KV);
  const entries = mainEntryPerRepo(all);
  const format = c.req.param("format");
  const dateStem = new Date().toISOString().slice(0, 10);

  switch (format) {
    case "manifest.json": {
      const payload = entries.map(e => {
        const { nist, eu, risks } = exportPayload(e.manifest, e.siteUrl);
        return JSON.parse(generateJsonExport(e.manifest, nist, eu, risks));
      });
      return download(JSON.stringify(payload, null, 2) + "\n", `grc-org-${dateStem}.json`, "application/json; charset=utf-8");
    }
    case "nist-csf.csv": {
      const csvs = entries.map(e => {
        const { nist } = exportPayload(e.manifest, e.siteUrl);
        return generateCsvNistCsf(e.manifest, nist);
      });
      return download(concatCsv(csvs), `grc-org-${dateStem}-nist-csf.csv`, "text/csv; charset=utf-8");
    }
    case "eu-ai-act.csv": {
      const csvs = entries.map(e => {
        const { eu } = exportPayload(e.manifest, e.siteUrl);
        return generateCsvEuAiAct(e.manifest, eu);
      });
      return download(concatCsv(csvs), `grc-org-${dateStem}-eu-ai-act.csv`, "text/csv; charset=utf-8");
    }
    case "risks.csv": {
      const csvs = entries.map(e => {
        const { risks } = exportPayload(e.manifest, e.siteUrl);
        return generateCsvRisks(e.manifest, risks);
      });
      return download(concatCsv(csvs), `grc-org-${dateStem}-risks.csv`, "text/csv; charset=utf-8");
    }
    case "vulnerabilities.csv": {
      const csvs = entries.map(e => generateCsvVulnerabilities(e.manifest));
      return download(concatCsv(csvs), `grc-org-${dateStem}-vulnerabilities.csv`, "text/csv; charset=utf-8");
    }
    default:
      return c.json({ error: `Unknown org export format: ${format}. Try manifest.json, nist-csf.csv, eu-ai-act.csv, risks.csv, vulnerabilities.csv.` }, 400);
  }
});

export default app;
