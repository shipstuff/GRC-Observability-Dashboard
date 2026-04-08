import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { Manifest } from "../scanner/types.js";
import { evaluateFramework, type ControlResult } from "../scanner/generators/framework-report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const CURRENT_FILE = join(DATA_DIR, "manifests.json");
const HISTORY_FILE = join(DATA_DIR, "history.json");

export interface StoredManifest {
  manifest: Manifest;
  receivedAt: string;
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
  nistResults: ControlResult[];
  artifacts: Manifest["artifacts"];
}

export interface FunctionScore {
  name: string;
  percentage: number;
  passed: number;
  partial: number;
  failed: number;
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadAll(): Promise<StoredManifest[]> {
  await ensureDataDir();
  try {
    const content = await readFile(CURRENT_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveAll(manifests: StoredManifest[]) {
  await ensureDataDir();
  await writeFile(CURRENT_FILE, JSON.stringify(manifests, null, 2), "utf-8");
}

async function loadHistory(): Promise<HistoryEntry[]> {
  await ensureDataDir();
  try {
    const content = await readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function appendHistory(entry: HistoryEntry) {
  const history = await loadHistory();
  history.push(entry);
  // Keep last 500 entries
  const trimmed = history.slice(-500);
  await writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
}

export async function upsertManifest(manifest: Manifest): Promise<void> {
  const all = await loadAll();

  const key = `${manifest.repo}:${manifest.branch}`;
  const idx = all.findIndex(m => `${m.manifest.repo}:${m.manifest.branch}` === key);

  const entry: StoredManifest = { manifest, receivedAt: new Date().toISOString() };

  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }

  await saveAll(all);

  // Append to history for trend tracking
  const summary = summarize(manifest);
  await appendHistory({
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
}

function calcNistScore(results: ControlResult[]): number {
  const applicable = results.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const partial = applicable.filter(r => r.status === "partial").length;
  return applicable.length > 0
    ? Math.round(((passed + partial * 0.5) / applicable.length) * 100)
    : 0;
}

export function getNistFunctionScores(results: ControlResult[]): FunctionScore[] {
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

export function summarize(manifest: Manifest): RepoSummary {
  const headers = manifest.securityHeaders;
  const headersPresent = headers
    ? Object.values(headers).filter(v => v === "present").length
    : 0;
  const headersTotal = headers ? Object.keys(headers).length : 0;

  let score = 0;
  let checks = 0;

  checks++;
  if (!manifest.secretsScan.detected) score++;

  if (headers) {
    checks += headersTotal;
    score += headersPresent;
  }

  if (manifest.https) {
    checks++;
    if (manifest.https.enforced) score++;
  }

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

export async function getRepoSummaries(): Promise<RepoSummary[]> {
  const all = await loadAll();
  return all.map(m => summarize(m.manifest));
}

export async function getHistory(repo?: string): Promise<HistoryEntry[]> {
  const history = await loadHistory();
  if (repo) return history.filter(h => h.repo === repo);
  return history;
}

export async function getBranches(repo: string): Promise<StoredManifest[]> {
  const all = await loadAll();
  return all.filter(m => m.manifest.repo === repo);
}
