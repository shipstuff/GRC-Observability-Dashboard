import express from "express";
import { parse } from "yaml";
import { upsertManifest, getRepoSummaries, loadAll, summarize, getHistory, getBranches, getNistFunctionScores } from "./store.js";
import { renderDashboard, renderRepoDetail, renderNistView, renderBranchComparison, renderTrendChart } from "./views/render.js";
import type { Manifest } from "../scanner/types.js";

const app = express();
const port = process.env.DASHBOARD_PORT || 3001;

app.use(express.json());
app.use(express.text({ type: "application/x-yaml" }));

// --- API ---

app.post("/api/report", async (req, res) => {
  try {
    let manifest: Manifest;
    if (typeof req.body === "string") {
      manifest = parse(req.body) as Manifest;
    } else {
      manifest = req.body as Manifest;
    }

    if (!manifest.repo || !manifest.scanDate) {
      res.status(400).json({ error: "Invalid manifest: missing repo or scanDate" });
      return;
    }

    await upsertManifest(manifest);
    console.log(`[API] Received manifest for ${manifest.repo} (${manifest.branch})`);
    res.json({ status: "ok", repo: manifest.repo, branch: manifest.branch });
  } catch (e: any) {
    console.error("[API] Error processing manifest:", e.message);
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/repos", async (_req, res) => {
  const summaries = await getRepoSummaries();
  // Strip nistResults (has functions) for JSON serialization
  const clean = summaries.map(({ nistResults, ...rest }) => rest);
  res.json(clean);
});

app.get("/api/repos/:owner/:name", async (req, res) => {
  const repoName = `${req.params.owner}/${req.params.name}`;
  const branch = (req.query.branch as string) || "main";
  const all = await loadAll();
  const entry = all.find(m => m.manifest.repo === repoName && m.manifest.branch === branch)
    || all.find(m => m.manifest.repo === repoName);

  if (!entry) {
    res.status(404).json({ error: "Repo not found" });
    return;
  }

  res.json(entry.manifest);
});

app.get("/api/history/:owner/:name", async (req, res) => {
  const repoName = `${req.params.owner}/${req.params.name}`;
  const history = await getHistory(repoName);
  res.json(history);
});

// --- UI (HTMX) ---

app.get("/", async (_req, res) => {
  const summaries = await getRepoSummaries();
  res.send(renderDashboard(summaries));
});

// Repo detail partial
app.get("/repo/:owner/:name", async (req, res) => {
  const repoName = `${req.params.owner}/${req.params.name}`;
  const all = await loadAll();
  const entries = all.filter(m => m.manifest.repo === repoName);

  if (entries.length === 0) {
    res.status(404).send("<p>REPO NOT FOUND</p>");
    return;
  }

  const manifest = entries[0].manifest;
  const summary = summarize(manifest);
  res.send(renderRepoDetail(manifest, summary));
});

// NIST CSF view partial
app.get("/nist/:owner/:name", async (req, res) => {
  const repoName = `${req.params.owner}/${req.params.name}`;
  const all = await loadAll();
  const entry = all.find(m => m.manifest.repo === repoName);

  if (!entry) {
    res.status(404).send("<p>REPO NOT FOUND</p>");
    return;
  }

  const summary = summarize(entry.manifest);
  const functionScores = getNistFunctionScores(summary.nistResults);
  res.send(renderNistView(summary, functionScores));
});

// Branch comparison partial
app.get("/branches/:owner/:name", async (req, res) => {
  const repoName = `${req.params.owner}/${req.params.name}`;
  const branches = await getBranches(repoName);

  if (branches.length === 0) {
    res.status(404).send("<p>NO BRANCHES FOUND</p>");
    return;
  }

  const summaries = branches.map(b => summarize(b.manifest));
  res.send(renderBranchComparison(summaries));
});

// Trend chart partial
app.get("/trends/:owner/:name", async (req, res) => {
  const repoName = `${req.params.owner}/${req.params.name}`;
  const history = await getHistory(repoName);
  res.send(renderTrendChart(history, repoName));
});

// Catch unhandled errors
process.on("uncaughtException", (err) => { console.error("Uncaught:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled rejection:", err); });

const server = app.listen(port, () => {
  console.log(`\n🏛️  GRC Dashboard running at http://localhost:${port}\n`);
});

// Keep process alive
server.keepAliveTimeout = 65000;
process.on("SIGINT", () => { server.close(); process.exit(0); });
