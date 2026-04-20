/**
 * Smoke test for dashboard render paths.
 *
 * Not a replacement for real unit tests — just catches obvious runtime
 * regressions (throws, null-deref, missing fields) that would take /
 * down in production. Runs in CI on every PR.
 *
 * Strategy: construct one new-shape manifest and one old-shape manifest
 * (simulating data stored in KV by an older scanner version), feed both
 * through every exported dashboard render function, and ensure none
 * throws. The old-shape fixture specifically exercises the hot path
 * that caused the 2026-04-18 outage: `manifest.aiSystems` missing
 * entirely because the manifest predates Phase 8A.
 */

import type { Manifest } from "../scanner/types.js";
import type { RepoSummary, HistoryEntry } from "../dashboard/worker.js";
import {
  renderDashboard,
  renderRepoDetail,
  renderNistView,
  renderBranchComparison,
  renderTrendChart,
  renderAIComplianceView,
  renderInventoryView,
} from "../dashboard/views/render.js";
import {
  evaluateEUAIAct,
  calcAIComplianceScore,
  getAIPhaseScores,
} from "../scanner/frameworks/eu-ai-act.js";
import { evaluateFramework } from "../scanner/generators/framework-report.js";

function fail(label: string, err: unknown): never {
  console.error(`✗ ${label}`);
  console.error(err);
  process.exit(1);
}

function ok(label: string) {
  console.log(`✓ ${label}`);
}

function baseArtifacts(): Manifest["artifacts"] {
  return {
    privacyPolicy: "generated",
    termsOfService: "generated",
    securityTxt: "present",
    vulnerabilityDisclosure: "present",
    incidentResponsePlan: "present",
  };
}

/** Current-shape manifest — everything the Phase 8 scanner emits. */
function newShapeManifest(): Manifest {
  return {
    repo: "smoke/new",
    scanDate: "2026-04-18T00:00:00Z",
    branch: "main",
    commit: "abc1234",
    dataCollection: [],
    thirdPartyServices: [],
    securityHeaders: null,
    https: null,
    dependencies: null,
    secretsScan: { detected: false, findings: [] },
    artifacts: {
      ...baseArtifacts(),
      aiUsagePolicy: "present",
      modelCards: "not-applicable",
      fria: "not-applicable",
    },
    accessControls: { branchProtection: true, requiredReviews: 1, signedCommits: false },
    aiSystems: [
      {
        provider: "OpenAI",
        sdk: "openai",
        location: "package.json",
        category: "inference",
        dataFlows: [],
        riskTier: "limited",
        riskTierSource: "heuristic",
        riskReasoning: "Category-default classification.",
        euMarket: true,
      },
    ],
  };
}

/**
 * Pre-Phase-8 shape: no `aiSystems` field, no AI artifact fields. Mirrors
 * what a scanner from before 2026-04-17 would have written into KV. The
 * 2026-04-18 outage was a failure to handle this case.
 */
function oldShapeManifest(): Manifest {
  return {
    repo: "smoke/old",
    scanDate: "2025-11-01T00:00:00Z",
    branch: "main",
    commit: "def5678",
    dataCollection: [],
    thirdPartyServices: [],
    securityHeaders: null,
    https: null,
    dependencies: null,
    secretsScan: { detected: false, findings: [] },
    artifacts: baseArtifacts(),
    accessControls: { branchProtection: true, requiredReviews: 1, signedCommits: false },
  } as unknown as Manifest; // intentionally missing aiSystems
}

function summaryFor(m: Manifest): RepoSummary {
  const nistResults = evaluateFramework(m);
  const applicable = nistResults.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const partial = applicable.filter(r => r.status === "partial").length;
  const nistScore = applicable.length > 0
    ? Math.round(((passed + partial * 0.5) / applicable.length) * 100)
    : 0;
  return {
    repo: m.repo,
    branch: m.branch,
    commit: m.commit,
    scanDate: m.scanDate,
    dataCollectionCount: m.dataCollection.length,
    thirdPartyCount: m.thirdPartyServices.length,
    secretsDetected: m.secretsScan.detected,
    headersPresent: 0,
    headersTotal: 0,
    httpsEnforced: null,
    certExpiry: null,
    criticalVulns: 0,
    highVulns: 0,
    complianceScore: 75,
    nistScore,
    nistResults,
    artifacts: m.artifacts,
    aiScore: calcAIComplianceScore(evaluateEUAIAct(m)),
    aiSystemCount: (m.aiSystems ?? []).length,
    aiHighRiskCount: 0,
    siteUrl: "https://example.com",
  };
}

function functionScoresFor(summary: RepoSummary) {
  return ["Govern", "Identify", "Protect", "Detect", "Respond", "Recover"].map(name => {
    const controls = summary.nistResults.filter(r => r.control.function === name);
    const applicable = controls.filter(r => r.status !== "not-applicable");
    const passed = applicable.filter(r => r.status === "pass").length;
    const partial = applicable.filter(r => r.status === "partial").length;
    const failed = applicable.filter(r => r.status === "fail").length;
    const percentage = applicable.length > 0
      ? Math.round(((passed + partial * 0.5) / applicable.length) * 100)
      : 100;
    return { name, percentage, passed, partial, failed };
  });
}

function historyFor(m: Manifest, aiCount: number): HistoryEntry[] {
  return [
    {
      repo: m.repo, branch: m.branch, commit: m.commit, scanDate: m.scanDate,
      complianceScore: 75, nistScore: 80, criticalVulns: 0, highVulns: 0,
      headersPresent: 0, headersTotal: 6,
      aiScore: aiCount > 0 ? 67 : undefined,
      aiSystemCount: aiCount,
    },
  ];
}

function assertHtml(html: string, label: string): void {
  if (typeof html !== "string") fail(label, `expected string, got ${typeof html}`);
  if (html.length < 100) fail(label, `HTML suspiciously short (${html.length} bytes)`);
  // "undefined" appearing in an HTML TEXT node (`>undefined<`) or as an
  // attribute value (`="undefined"`) is almost always a bug where a template
  // interpolated a missing field. We don't ban the token outright because
  // inline <script> blocks legitimately reference `undefined` as an
  // identifier.
  if (/>undefined</.test(html) || /="undefined"/.test(html)) {
    fail(label, `rendered HTML contains a bare "undefined" in a text or attribute context`);
  }
}

function run() {
  const newM = newShapeManifest();
  const oldM = oldShapeManifest();

  for (const [label, m] of [["new-shape", newM], ["old-shape", oldM]] as const) {
    try {
      const summary = summaryFor(m);
      const branches = new Map([[m.repo, [m.branch]]]);

      assertHtml(renderDashboard([summary], branches, "smoke-org"), `renderDashboard (${label})`);
      assertHtml(renderRepoDetail(m, summary, {}), `renderRepoDetail (${label})`);
      assertHtml(renderNistView(summary, functionScoresFor(summary)), `renderNistView (${label})`);
      assertHtml(
        renderBranchComparison([summary, { ...summary, branch: "feat/x", scanDate: "2026-04-17T00:00:00Z" }]),
        `renderBranchComparison (${label})`,
      );
      assertHtml(
        renderTrendChart(historyFor(m, (m.aiSystems ?? []).length), m.repo, m.branch),
        `renderTrendChart (${label})`,
      );
      assertHtml(renderAIComplianceView(m), `renderAIComplianceView (${label})`);
      ok(`all renders for ${label} manifest`);
    } catch (err) {
      fail(`${label} manifest render pipeline`, err);
    }
  }

  // EU AI Act + AI score helpers are also called from non-render paths
  // (summarize, HistoryEntry population). Smoke them independently too.
  try {
    for (const [label, m] of [["new", newM], ["old", oldM]] as const) {
      const results = evaluateEUAIAct(m);
      if (!Array.isArray(results) || results.length === 0) fail(`evaluateEUAIAct (${label})`, "empty");
      calcAIComplianceScore(results);
      getAIPhaseScores(results);
    }
    ok("evaluateEUAIAct + calcAIComplianceScore + getAIPhaseScores");
  } catch (err) {
    fail("AI framework helpers", err);
  }

  // Inventory view with zero rows should render the empty state cleanly.
  try {
    assertHtml(renderInventoryView([], "smoke-org"), "renderInventoryView (empty)");
    assertHtml(
      renderInventoryView(
        [
          {
            repo: "smoke/new", branch: "main", scanDate: "2026-04-18T00:00:00Z",
            provider: "OpenAI", sdk: "openai", category: "inference",
            location: "package.json", riskTier: "limited", riskTierSource: "heuristic",
            euMarket: true,
          },
        ],
        "smoke-org",
      ),
      "renderInventoryView (populated)",
    );
    ok("renderInventoryView empty + populated");
  } catch (err) {
    fail("renderInventoryView", err);
  }

  console.log("\nAll dashboard smoke tests passed.");
}

run();
