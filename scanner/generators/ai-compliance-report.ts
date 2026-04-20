import type { Manifest, AIComplianceResult, AIRmfPhase } from "../types.js";
import type { SiteConfig } from "../config.js";
import {
  calcAIComplianceScore,
  getAIPhaseScores,
} from "../frameworks/eu-ai-act.js";

function progressBar(pct: number, width: number = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

function statusLabel(s: AIComplianceResult["status"]): string {
  switch (s) {
    case "pass": return "PASS";
    case "partial": return "PARTIAL";
    case "fail": return "FAIL";
    case "not-applicable": return "N/A";
  }
}

export function generateAIComplianceReport(
  results: AIComplianceResult[],
  manifest: Manifest,
  config: SiteConfig,
): string {
  const scores = getAIPhaseScores(results);
  const applicable = results.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const partial = applicable.filter(r => r.status === "partial").length;
  const failed = applicable.filter(r => r.status === "fail").length;
  const overallPct = calcAIComplianceScore(results);

  const aiCount = manifest.aiSystems.length;
  const highRiskCount = manifest.aiSystems.filter(s => s.riskTier === "high" || s.riskTier === "prohibited").length;
  const euMarketCount = manifest.aiSystems.filter(s => s.euMarket === true).length;

  const lines: string[] = [
    `# EU AI Act Assessment Report — ${config.siteName}\n`,
    `**Scope:** ${config.siteUrl}`,
    `**Date:** ${new Date(manifest.scanDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `**Framework:** Regulation (EU) 2024/1689 (EU AI Act), as published in OJ L, 12 July 2024.`,
    `**Cross-references:** NIST AI Risk Management Framework (NIST AI 100-1, v1.0, January 2023); ISO/IEC 42001:2023 Annex A.`,
    `**Branch:** ${manifest.branch} (${manifest.commit})\n`,
    "---\n",
    `## AI Inventory Snapshot`,
    `- Detected AI systems: **${aiCount}**`,
    `- High-risk or prohibited tier: **${highRiskCount}**`,
    `- Declared on EU market: **${euMarketCount}**\n`,
    "---\n",
    `## Overall Score: ${overallPct}%\n`,
    `${progressBar(overallPct, 30)} ${overallPct}%\n`,
    `${passed} passed, ${partial} partial, ${failed} failed out of ${applicable.length} applicable articles (${results.length - applicable.length} not applicable). This is a scan-derived assessment, not a conformity declaration.\n`,
    `## Score by NIST AI RMF Phase\n`,
    "| Phase | Score | Status |",
    "|-------|-------|--------|",
  ];

  for (const s of scores) {
    const naCount = results.filter(r => r.phase === s.name && r.status === "not-applicable").length;
    const badge = s.applicable === 0
      ? `${progressBar(100, 15)} N/A`
      : `${progressBar(s.percentage, 15)} ${s.percentage}%`;
    lines.push(`| **${s.name}** | ${badge} | ${s.passed}P ${s.partial}A ${s.failed}F ${naCount > 0 ? naCount + "N/A" : ""} |`);
  }

  lines.push("\n*P = Pass, A = Partial, F = Fail, N/A = Not Applicable*\n");
  lines.push("---\n");

  lines.push("## Detailed Article Assessment\n");

  const phases: AIRmfPhase[] = ["Govern", "Map", "Measure", "Manage"];
  for (const phase of phases) {
    const phaseResults = results.filter(r => r.phase === phase);
    if (phaseResults.length === 0) continue;
    const score = scores.find(s => s.name === phase)!;

    lines.push(`### ${phase} — ${score.applicable === 0 ? "N/A" : score.percentage + "%"}\n`);
    lines.push("| ID | Article | Status | NIST AI RMF | ISO/IEC 42001 |");
    lines.push("|----|---------|--------|-------------|---------------|");
    for (const r of phaseResults) {
      lines.push(`| ${r.articleId} | ${r.title} | ${statusLabel(r.status)} | ${r.nistAiRmf.join(", ") || "-"} | ${r.iso42001.join(", ") || "-"} |`);
    }
    lines.push("");

    const gaps = phaseResults.filter(r => r.status === "fail" || r.status === "partial");
    if (gaps.length > 0) {
      lines.push("**Gaps:**\n");
      for (const g of gaps) {
        lines.push(`- **${g.articleId} — ${g.title}** (${statusLabel(g.status)}): ${g.evidence}`);
      }
      lines.push("");
    }
  }

  lines.push("---\n");

  // NIST AI RMF coverage
  lines.push("## NIST AI RMF Cross-Reference\n");
  const rmfCoverage = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    if (r.status === "not-applicable") continue;
    for (const s of r.nistAiRmf) {
      if (!rmfCoverage.has(s)) rmfCoverage.set(s, { total: 0, passed: 0 });
      const entry = rmfCoverage.get(s)!;
      entry.total++;
      if (r.status === "pass") entry.passed++;
    }
  }
  if (rmfCoverage.size > 0) {
    lines.push("| NIST AI RMF | Coverage |");
    lines.push("|-------------|----------|");
    for (const [id, { total, passed }] of [...rmfCoverage.entries()].sort()) {
      const pct = Math.round((passed / total) * 100);
      lines.push(`| ${id} | ${pct}% (${passed}/${total} checks passing) |`);
    }
  } else {
    lines.push("_No applicable articles mapped to NIST AI RMF subcategories in this scan._");
  }
  lines.push("");

  // ISO/IEC 42001 coverage
  lines.push("## ISO/IEC 42001 Cross-Reference\n");
  const isoCoverage = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    if (r.status === "not-applicable") continue;
    for (const s of r.iso42001) {
      if (!isoCoverage.has(s)) isoCoverage.set(s, { total: 0, passed: 0 });
      const entry = isoCoverage.get(s)!;
      entry.total++;
      if (r.status === "pass") entry.passed++;
    }
  }
  if (isoCoverage.size > 0) {
    lines.push("| ISO/IEC 42001 | Coverage |");
    lines.push("|---------------|----------|");
    for (const [id, { total, passed }] of [...isoCoverage.entries()].sort()) {
      const pct = Math.round((passed / total) * 100);
      lines.push(`| ${id} | ${pct}% (${passed}/${total} checks passing) |`);
    }
  } else {
    lines.push("_No applicable articles mapped to ISO/IEC 42001 controls in this scan._");
  }
  lines.push("");

  lines.push("---\n");
  lines.push("## Methodology\n");
  lines.push("Articles are evaluated against the repo's scan manifest and AI-system classifications. Many obligations are program-level and cannot be verified from code alone; those resolve to **partial** with instructional evidence pointing to what still needs documentation.");
  lines.push("");
  lines.push("Applicability follows EU AI Act Article 6 and Annex III: most high-risk obligations (Art. 9/11/12/13/14/15/27/71/73) are marked **N/A** unless a system classified as `high` or `prohibited` is detected. Article 5 (prohibited practices) always applies. Article 50 (user transparency) applies when any system is at least `limited` tier. Article 27 (FRIA) applies only to specific deployer categories — public bodies, private providers of public services, and deployers of Annex III point 5 credit/insurance systems. Article 71 (EU database) covers high-risk Annex III systems placed on the EU market; the underlying registration obligations live in Article 49 (providers) and Article 26(8) (certain public-sector deployers).");
  lines.push("");
  lines.push("**Scoring:** Pass = 1.0, Partial = 0.5, Fail = 0, N/A = excluded from calculation.");
  lines.push("");
  lines.push("**Caveat:** This report surfaces obligations so they can be closed. It is not legal advice and does not substitute for a conformity assessment by a notified body.");

  return lines.join("\n");
}
