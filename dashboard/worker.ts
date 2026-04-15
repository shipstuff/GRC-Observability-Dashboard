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

    const policyServed: Record<string, "served" | "unreachable" | "not-configured"> = {
      privacyPolicy: "not-configured",
      termsOfService: "not-configured",
      vulnerabilityDisclosure: "not-configured",
      incidentResponsePlan: "not-configured",
      securityTxt: "not-configured",
    };

    const checks: Array<Promise<void>> = [];
    for (const key of Object.keys(policyServed) as Array<keyof typeof policyServed>) {
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
    // servability is a separate concept exposed via the policyServed response
    // field so the UI can display both independently.

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
