import type { Manifest } from "../../types.js";
import type { ControlResult } from "../framework-report.js";
import type { Risk } from "../risk-assessment.js";
import type { AIComplianceResult } from "../../types.js";

/**
 * CSV export — one row per finding, flattened. Covers the four "finding"
 * tables an auditor workflow cares about:
 *
 * - `nist-csf.csv`: per-control status + evidence
 * - `eu-ai-act.csv`: per-article status + evidence
 * - `risks.csv`: the full risk register (security + ai-compliance categories)
 * - `vulnerabilities.csv`: per-CVE dependency advisories
 *
 * Flat-file audit workpapers expect this shape; most spreadsheet tools
 * drop CSVs straight into a pivot table.
 */

function csvEscape(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  // RFC 4180: quote anything containing a comma, quote, or newline;
  // double-up internal quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(header: string[], rows: Array<Array<unknown>>): string {
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\n") + "\n";
}

export function generateCsvNistCsf(manifest: Manifest, results: ControlResult[]): string {
  return toCsv(
    ["repo", "branch", "commit", "scan_date", "control_id", "function", "category", "subcategory", "status", "evidence", "soc2", "iso27001"],
    results.map(r => [
      manifest.repo,
      manifest.branch,
      manifest.commit,
      manifest.scanDate,
      r.control.id,
      r.control.function,
      r.control.category,
      r.control.subcategory,
      r.status,
      r.evidence,
      r.soc2.join("; "),
      r.iso27001.join("; "),
    ]),
  );
}

export function generateCsvEuAiAct(manifest: Manifest, results: AIComplianceResult[]): string {
  return toCsv(
    ["repo", "branch", "commit", "scan_date", "article_id", "article", "title", "phase", "status", "evidence", "nist_ai_rmf", "iso42001"],
    results.map(r => [
      manifest.repo,
      manifest.branch,
      manifest.commit,
      manifest.scanDate,
      r.articleId,
      r.article,
      r.title,
      r.phase,
      r.status,
      r.evidence,
      r.nistAiRmf.join("; "),
      r.iso42001.join("; "),
    ]),
  );
}

export function generateCsvRisks(manifest: Manifest, risks: Risk[]): string {
  return toCsv(
    ["repo", "branch", "commit", "scan_date", "risk_id", "category", "title", "severity", "likelihood", "impact", "status", "mitigation", "frameworks", "description"],
    risks.map(r => [
      manifest.repo,
      manifest.branch,
      manifest.commit,
      manifest.scanDate,
      r.id,
      r.category,
      r.title,
      r.severity,
      r.likelihood,
      r.impact,
      r.status,
      r.mitigation,
      r.framework.join("; "),
      r.description,
    ]),
  );
}

export function generateCsvVulnerabilities(manifest: Manifest): string {
  const vulns = manifest.vulnerabilities ?? [];
  return toCsv(
    ["repo", "branch", "commit", "scan_date", "advisory_id", "package", "severity", "title", "range", "cvss_score", "is_direct", "fix_available", "url"],
    vulns.map(v => [
      manifest.repo,
      manifest.branch,
      manifest.commit,
      manifest.scanDate,
      v.advisoryId,
      v.package,
      v.severity,
      v.title,
      v.range,
      v.cvssScore,
      v.isDirect ? "true" : "false",
      v.fixAvailable ? "true" : "false",
      v.url,
    ]),
  );
}
