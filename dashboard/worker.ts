import { Hono } from "hono";
import { parse } from "yaml";
import type { Manifest } from "../scanner/types.js";
import { evaluateFramework } from "../scanner/generators/framework-report.js";
import { renderDashboard, renderRepoDetail, renderNistView, renderBranchComparison, renderTrendChart } from "./views/render.js";

type Bindings = {
  GRC_KV: KVNamespace;
  ORG_NAME?: string;
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
}

// --- KV helpers ---

async function getManifests(kv: KVNamespace): Promise<{ key: string; manifest: Manifest; receivedAt: string; siteUrl?: string }[]> {
  const list = await kv.list({ prefix: "manifest:" });
  const results = [];
  for (const key of list.keys) {
    const val = await kv.get(key.name, "json") as { manifest: Manifest; receivedAt: string; siteUrl?: string } | null;
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
    const entry = await kv.get(key, "json") as { manifest: Manifest; receivedAt: string; siteUrl?: string } | null;
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
    return await kv.get(preferred.name, "json") as { manifest: Manifest; receivedAt: string; siteUrl?: string } | null;
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
  return ["Identify", "Protect", "Detect", "Respond", "Recover"].map(fn => {
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
  const artifactValues = Object.values(manifest.artifacts);
  checks += artifactValues.length; score += artifactValues.filter(v => v !== "missing").length;
  if (manifest.accessControls.branchProtection !== null) { checks++; if (manifest.accessControls.branchProtection) score++; }

  const nistResults = evaluateFramework(manifest);

  return {
    repo: manifest.repo, branch: manifest.branch, commit: manifest.commit, scanDate: manifest.scanDate,
    dataCollectionCount: manifest.dataCollection.length, thirdPartyCount: manifest.thirdPartyServices.length,
    secretsDetected: manifest.secretsScan.detected, headersPresent, headersTotal,
    httpsEnforced: manifest.https?.enforced ?? null, certExpiry: manifest.https?.certExpiry ?? null,
    criticalVulns: manifest.dependencies?.criticalVulnerabilities ?? 0,
    highVulns: manifest.dependencies?.highVulnerabilities ?? 0,
    complianceScore: checks > 0 ? Math.round((score / checks) * 100) : 0,
    nistScore: calcNistScore(nistResults), nistResults, artifacts: manifest.artifacts, siteUrl,
  };
}

function preferMain(entries: { manifest: Manifest; receivedAt: string; siteUrl?: string }[]) {
  if (entries.length === 0) return null;
  return entries.find(e => e.manifest.branch === "main" || e.manifest.branch === "master") || entries[0];
}

function findByBranch(entries: { manifest: Manifest; receivedAt: string; siteUrl?: string }[], branch?: string) {
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

    // Merge with existing data — preserve live check results (headers, TLS) if new scan is static-only
    const siteUrl = c.req.query("site_url") || "";
    const kvKey = `manifest:${manifest.repo}:${manifest.branch}`;
    const existing = await c.env.GRC_KV.get(kvKey, "json") as { manifest: Manifest; receivedAt: string; siteUrl?: string } | null;

    if (existing) {
      // If new scan has no security headers but old one does, preserve the old live data
      if (!manifest.securityHeaders && existing.manifest.securityHeaders) {
        manifest.securityHeaders = existing.manifest.securityHeaders;
      }
      if (!manifest.https && existing.manifest.https) {
        manifest.https = existing.manifest.https;
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
  const stored = await c.env.GRC_KV.get(kvKey, "json") as { manifest: Manifest; receivedAt: string; siteUrl?: string } | null;

  if (!stored) return c.json({ error: "Repo not found" }, 404);

  const siteUrl = stored.siteUrl || c.req.query("url");
  if (!siteUrl) return c.json({ error: "No site_url configured for this repo" }, 400);

  try {
    // Check security headers
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

    stored.manifest.scanDate = new Date().toISOString();
    await c.env.GRC_KV.put(kvKey, JSON.stringify(stored));

    const summary = summarize(stored.manifest);
    await appendHistory(c.env.GRC_KV, repoName, {
      repo: repoName, branch, commit: stored.manifest.commit,
      scanDate: stored.manifest.scanDate, complianceScore: summary.complianceScore,
      nistScore: summary.nistScore, criticalVulns: summary.criticalVulns,
      highVulns: summary.highVulns, headersPresent: summary.headersPresent,
      headersTotal: summary.headersTotal,
    });

    return c.json({
      status: "ok",
      headersPresent: summary.headersPresent,
      headersTotal: summary.headersTotal,
      httpsEnforced: summary.httpsEnforced,
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

  const summaries = [...byRepo.values()].map(m => summarize(m.manifest, m.siteUrl));

  // Sort by most recent scan
  summaries.sort((a, b) => new Date(b.scanDate).getTime() - new Date(a.scanDate).getTime());

  const orgName = c.env.ORG_NAME || "";
  return c.html(renderDashboard(summaries, branchesPerRepo, orgName));
});

app.get("/repo/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const branch = c.req.query("branch") || undefined;
  const all = await getManifests(c.env.GRC_KV);
  const entry = findByBranch(all.filter(m => m.manifest.repo === repoName), branch);
  if (!entry) return c.html("<p>REPO NOT FOUND</p>", 404);
  return c.html(renderRepoDetail(entry.manifest, summarize(entry.manifest, entry.siteUrl)));
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

export default app;
