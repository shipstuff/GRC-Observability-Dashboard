import { Manifest } from "../types.js";
import { SiteConfig } from "../config.js";
import { NIST_CSF_CONTROLS, FrameworkControl } from "../frameworks/nist-csf.js";
import { getCrossMapping } from "../frameworks/cross-map.js";

export interface ControlResult {
  control: FrameworkControl;
  status: "pass" | "fail" | "partial" | "not-applicable";
  evidence: string;
  soc2: string[];
  iso27001: string[];
}

export interface FunctionScore {
  name: string;
  total: number;
  passed: number;
  partial: number;
  failed: number;
  na: number;
  percentage: number;
}

export function evaluateFramework(manifest: Manifest): ControlResult[] {
  return NIST_CSF_CONTROLS.map(control => {
    const status = control.check(manifest);
    const evidence = control.evidence(manifest);
    const cross = getCrossMapping(control.id);

    return {
      control,
      status,
      evidence,
      soc2: cross?.soc2 ?? [],
      iso27001: cross?.iso27001 ?? [],
    };
  });
}

function calcFunctionScores(results: ControlResult[]): FunctionScore[] {
  const functions = ["Identify", "Protect", "Detect", "Respond", "Recover"] as const;

  return functions.map(fn => {
    const controls = results.filter(r => r.control.function === fn);
    const applicable = controls.filter(r => r.status !== "not-applicable");
    const passed = applicable.filter(r => r.status === "pass").length;
    const partial = applicable.filter(r => r.status === "partial").length;
    const failed = applicable.filter(r => r.status === "fail").length;

    // Partial counts as 0.5
    const score = applicable.length > 0
      ? Math.round(((passed + partial * 0.5) / applicable.length) * 100)
      : 100;

    return {
      name: fn,
      total: controls.length,
      passed,
      partial,
      failed,
      na: controls.length - applicable.length,
      percentage: score,
    };
  });
}

function progressBar(pct: number, width: number = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

export function generateFrameworkReport(
  results: ControlResult[],
  manifest: Manifest,
  config: SiteConfig
): string {
  const scores = calcFunctionScores(results);
  const applicable = results.filter(r => r.status !== "not-applicable");
  const overallPassed = applicable.filter(r => r.status === "pass").length;
  const overallPartial = applicable.filter(r => r.status === "partial").length;
  const overallPct = applicable.length > 0
    ? Math.round(((overallPassed + overallPartial * 0.5) / applicable.length) * 100)
    : 100;

  const lines: string[] = [
    `# NIST CSF Compliance Report — ${config.siteName}\n`,
    `**Scope:** ${config.siteUrl}`,
    `**Date:** ${new Date(manifest.scanDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `**Framework:** NIST Cybersecurity Framework (CSF) 2.0`,
    `**Branch:** ${manifest.branch} (${manifest.commit})\n`,
    "---\n",

    // Overall score
    `## Overall Compliance: ${overallPct}%\n`,
    `${progressBar(overallPct, 30)} ${overallPct}%\n`,
    `${overallPassed} passed, ${overallPartial} partial, ${applicable.length - overallPassed - overallPartial} failed out of ${applicable.length} applicable controls\n`,

    // Function breakdown
    "## Compliance by Function\n",
    "| Function | Score | Status |",
    "|----------|-------|--------|",
  ];

  for (const s of scores) {
    lines.push(`| **${s.name}** | ${progressBar(s.percentage, 15)} ${s.percentage}% | ${s.passed}P ${s.partial}A ${s.failed}F ${s.na > 0 ? s.na + "N/A" : ""} |`);
  }

  lines.push("\n*P = Pass, A = Partial, F = Fail, N/A = Not Applicable*\n");
  lines.push("---\n");

  // Detailed results by function
  lines.push("## Detailed Control Assessment\n");

  for (const fn of ["Identify", "Protect", "Detect", "Respond", "Recover"]) {
    const fnResults = results.filter(r => r.control.function === fn);
    const score = scores.find(s => s.name === fn)!;

    lines.push(`### ${fn} — ${score.percentage}%\n`);
    lines.push("| ID | Control | Status | SOC 2 | ISO 27001 |");
    lines.push("|-----|---------|--------|-------|-----------|");

    for (const r of fnResults) {
      const statusIcon = r.status === "pass" ? "PASS"
        : r.status === "partial" ? "PARTIAL"
        : r.status === "not-applicable" ? "N/A"
        : "FAIL";

      lines.push(`| ${r.control.id} | ${r.control.description} | ${statusIcon} | ${r.soc2.join(", ") || "-"} | ${r.iso27001.join(", ") || "-"} |`);
    }
    lines.push("");

    // Show evidence for failures
    const failures = fnResults.filter(r => r.status === "fail" || r.status === "partial");
    if (failures.length > 0) {
      lines.push("**Gaps:**\n");
      for (const f of failures) {
        lines.push(`- **${f.control.id}** (${f.status.toUpperCase()}): ${f.evidence}`);
      }
      lines.push("");
    }
  }

  lines.push("---\n");

  // SOC 2 coverage summary
  lines.push("## SOC 2 Cross-Reference\n");
  const soc2Controls = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    for (const s of r.soc2) {
      if (!soc2Controls.has(s)) soc2Controls.set(s, { total: 0, passed: 0 });
      const entry = soc2Controls.get(s)!;
      entry.total++;
      if (r.status === "pass") entry.passed++;
    }
  }

  lines.push("| SOC 2 Control | Coverage |");
  lines.push("|---------------|----------|");
  for (const [id, { total, passed }] of [...soc2Controls.entries()].sort()) {
    const pct = Math.round((passed / total) * 100);
    lines.push(`| ${id} | ${pct}% (${passed}/${total} checks passing) |`);
  }
  lines.push("");

  // ISO 27001 coverage summary
  lines.push("## ISO 27001 Cross-Reference\n");
  const isoControls = new Map<string, { total: number; passed: number }>();
  for (const r of results) {
    for (const s of r.iso27001) {
      if (!isoControls.has(s)) isoControls.set(s, { total: 0, passed: 0 });
      const entry = isoControls.get(s)!;
      entry.total++;
      if (r.status === "pass") entry.passed++;
    }
  }

  lines.push("| ISO 27001 Control | Coverage |");
  lines.push("|-------------------|----------|");
  for (const [id, { total, passed }] of [...isoControls.entries()].sort()) {
    const pct = Math.round((passed / total) * 100);
    lines.push(`| ${id} | ${pct}% (${passed}/${total} checks passing) |`);
  }
  lines.push("");

  lines.push("---\n");
  lines.push("## Methodology\n");
  lines.push("Controls are evaluated automatically by the GRC scanner against the NIST CSF 2.0 framework. Each control maps to one or more scanner checks. Cross-references to SOC 2 Trust Service Criteria and ISO 27001 Annex A controls are provided for multi-framework compliance tracking.\n");
  lines.push("**Scoring:** Pass = 1.0, Partial = 0.5, Fail = 0, N/A = excluded from calculation.\n");

  return lines.join("\n");
}
