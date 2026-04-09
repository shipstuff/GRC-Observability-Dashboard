import { Hono } from "hono";
import { parse } from "yaml";
import type { Manifest } from "../scanner/types.js";
import { evaluateFramework } from "../scanner/generators/framework-report.js";
import { renderDashboard, renderRepoDetail, renderNistView, renderBranchComparison, renderTrendChart } from "./views/render.js";
import type { RepoSummary, FunctionScore, HistoryEntry } from "./store.js";

type Bindings = {
  GRC_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// --- KV Storage helpers ---

async function getManifests(kv: KVNamespace): Promise<{ key: string; manifest: Manifest; receivedAt: string }[]> {
  const list = await kv.list({ prefix: "manifest:" });
  const results = [];
  for (const key of list.keys) {
    const val = await kv.get(key.name, "json") as { manifest: Manifest; receivedAt: string } | null;
    if (val) results.push({ key: key.name, ...val });
  }
  return results;
}

async function getHistory(kv: KVNamespace, repo?: string): Promise<HistoryEntry[]> {
  const key = repo ? `history:${repo}` : "history:all";
  const val = await kv.get(key, "json") as HistoryEntry[] | null;
  return val ?? [];
}

async function appendHistory(kv: KVNamespace, repo: string, entry: HistoryEntry) {
  const key = `history:${repo}`;
  const existing = await getHistory(kv, repo);
  existing.push(entry);
  const trimmed = existing.slice(-500);
  await kv.put(key, JSON.stringify(trimmed));
}

function calcNistScore(results: ReturnType<typeof evaluateFramework>): number {
  const applicable = results.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const partial = applicable.filter(r => r.status === "partial").length;
  return applicable.length > 0
    ? Math.round(((passed + partial * 0.5) / applicable.length) * 100)
    : 0;
}

function getNistFunctionScores(results: ReturnType<typeof evaluateFramework>): FunctionScore[] {
  const functions = ["Identify", "Protect", "Detect", "Respond", "Recover"];
  return functions.map(fn => {
    const controls = results.filter(r => r.control.function === fn);
    const applicable = controls.filter(r => r.status !== "not-applicable");
    const passed = applicable.filter(r => r.status === "pass").length;
    const partial = applicable.filter(r => r.status === "partial").length;
    const failed = applicable.filter(r => r.status === "fail").length;
    const pct = applicable.length > 0
      ? Math.round(((passed + partial * 0.5) / applicable.length) * 100)
      : 100;
    return { name: fn, percentage: pct, passed, partial, failed };
  });
}

function summarize(manifest: Manifest): RepoSummary {
  const headers = manifest.securityHeaders;
  const headersPresent = headers ? Object.values(headers).filter(v => v === "present").length : 0;
  const headersTotal = headers ? Object.keys(headers).length : 0;

  let score = 0;
  let checks = 0;

  checks++;
  if (!manifest.secretsScan.detected) score++;

  if (headers) { checks += headersTotal; score += headersPresent; }
  if (manifest.https) { checks++; if (manifest.https.enforced) score++; }
  if (manifest.dependencies) {
    checks++;
    if (manifest.dependencies.criticalVulnerabilities === 0 && manifest.dependencies.highVulnerabilities === 0) score++;
  }

  const artifactValues = Object.values(manifest.artifacts);
  checks += artifactValues.length;
  score += artifactValues.filter(v => v !== "missing").length;

  if (manifest.accessControls.branchProtection !== null) {
    checks++;
    if (manifest.accessControls.branchProtection) score++;
  }

  const complianceScore = checks > 0 ? Math.round((score / checks) * 100) : 0;
  const nistResults = evaluateFramework(manifest);
  const nistScore = calcNistScore(nistResults);

  return {
    repo: manifest.repo,
    branch: manifest.branch,
    commit: manifest.commit,
    scanDate: manifest.scanDate,
    dataCollectionCount: manifest.dataCollection.length,
    thirdPartyCount: manifest.thirdPartyServices.length,
    secretsDetected: manifest.secretsScan.detected,
    headersPresent,
    headersTotal,
    httpsEnforced: manifest.https?.enforced ?? null,
    certExpiry: manifest.https?.certExpiry ?? null,
    criticalVulns: manifest.dependencies?.criticalVulnerabilities ?? 0,
    highVulns: manifest.dependencies?.highVulnerabilities ?? 0,
    complianceScore,
    nistScore,
    nistResults,
    artifacts: manifest.artifacts,
  };
}

// Pick main/master branch entry, fall back to first entry
function preferMain(entries: { manifest: Manifest; receivedAt: string }[]) {
  if (entries.length === 0) return null;
  return entries.find(e => e.manifest.branch === "main" || e.manifest.branch === "master") || entries[0];
}

// --- API ---

app.post("/api/report", async (c) => {
  try {
    const contentType = c.req.header("content-type") || "";
    let manifest: Manifest;

    if (contentType.includes("yaml")) {
      const text = await c.req.text();
      manifest = parse(text) as Manifest;
    } else {
      manifest = await c.req.json() as Manifest;
    }

    if (!manifest.repo || !manifest.scanDate) {
      return c.json({ error: "Invalid manifest: missing repo or scanDate" }, 400);
    }

    const kvKey = `manifest:${manifest.repo}:${manifest.branch}`;
    await c.env.GRC_KV.put(kvKey, JSON.stringify({ manifest, receivedAt: new Date().toISOString() }));

    const summary = summarize(manifest);
    await appendHistory(c.env.GRC_KV, manifest.repo, {
      repo: manifest.repo,
      branch: manifest.branch,
      commit: manifest.commit,
      scanDate: manifest.scanDate,
      complianceScore: summary.complianceScore,
      nistScore: summary.nistScore,
      criticalVulns: summary.criticalVulns,
      highVulns: summary.highVulns,
      headersPresent: summary.headersPresent,
      headersTotal: summary.headersTotal,
    });

    return c.json({ status: "ok", repo: manifest.repo, branch: manifest.branch });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get("/api/repos", async (c) => {
  const all = await getManifests(c.env.GRC_KV);
  const summaries = all.map(m => {
    const { nistResults, ...rest } = summarize(m.manifest);
    return rest;
  });
  return c.json(summaries);
});

app.get("/api/repos/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const entry = all.find(m => m.manifest.repo === repoName);
  if (!entry) return c.json({ error: "Repo not found" }, 404);
  return c.json(entry.manifest);
});

app.get("/api/history/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const history = await getHistory(c.env.GRC_KV, repoName);
  return c.json(history);
});

// --- UI ---

app.get("/", async (c) => {
  const all = await getManifests(c.env.GRC_KV);

  // Group by repo, prefer main/master branch for the repo card
  const byRepo = new Map<string, typeof all[number]>();
  for (const entry of all) {
    const repo = entry.manifest.repo;
    const existing = byRepo.get(repo);
    if (!existing) {
      byRepo.set(repo, entry);
    } else {
      const isMain = entry.manifest.branch === "main" || entry.manifest.branch === "master";
      const existingIsMain = existing.manifest.branch === "main" || existing.manifest.branch === "master";
      if (isMain && !existingIsMain) {
        byRepo.set(repo, entry);
      }
    }
  }

  const summaries = [...byRepo.values()].map(m => summarize(m.manifest));
  return c.html(renderDashboard(summaries));
});

app.get("/repo/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const entry = preferMain(all.filter(m => m.manifest.repo === repoName));
  if (!entry) return c.html("<p>REPO NOT FOUND</p>", 404);
  const summary = summarize(entry.manifest);
  return c.html(renderRepoDetail(entry.manifest, summary));
});

app.get("/nist/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const entry = preferMain(all.filter(m => m.manifest.repo === repoName));
  if (!entry) return c.html("<p>REPO NOT FOUND</p>", 404);
  const summary = summarize(entry.manifest);
  const functionScores = getNistFunctionScores(summary.nistResults);
  return c.html(renderNistView(summary, functionScores));
});

app.get("/branches/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const all = await getManifests(c.env.GRC_KV);
  const entries = all.filter(m => m.manifest.repo === repoName);
  if (entries.length === 0) return c.html("<p>NO BRANCHES FOUND</p>", 404);
  const summaries = entries.map(e => summarize(e.manifest));
  return c.html(renderBranchComparison(summaries));
});

app.get("/trends/:owner/:name", async (c) => {
  const repoName = `${c.req.param("owner")}/${c.req.param("name")}`;
  const history = await getHistory(c.env.GRC_KV, repoName);
  return c.html(renderTrendChart(history, repoName));
});

export default app;
