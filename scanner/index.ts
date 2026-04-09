import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { stringify } from "yaml";
import { scanForms } from "./rules/forms.js";
import { scanDependencies } from "./rules/dependencies.js";
import { scanCookies } from "./rules/cookies.js";
import { scanEndpoints } from "./rules/endpoints.js";
import { scanSecrets } from "./rules/secrets.js";
import { scanTracking } from "./rules/tracking.js";
import { scanSecurityHeaders } from "./rules/security-headers.js";
import { scanTls } from "./rules/tls.js";
import { scanArtifacts } from "./rules/artifacts.js";
import { scanAccessControls, generateAccessControlReport } from "./rules/access-controls.js";
import { ScanContext, Manifest } from "./types.js";
import { loadConfig } from "./config.js";
import { renderPrivacyPolicy, renderTermsOfService, renderVulnerabilityDisclosure, renderIncidentResponsePlan } from "./render.js";
import { generateSecurityTxt } from "./generators/security-txt.js";
import { generateHeaderRecommendations, generateHeaderReport } from "./generators/security-headers.js";
import { assessRisks, generateRiskAssessment } from "./generators/risk-assessment.js";
import { evaluateFramework, generateFrameworkReport } from "./generators/framework-report.js";
import { runAIEnhancements } from "./ai/enhance.js";
import { generateAIReport } from "./ai/report.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function getGitInfo(repoPath: string): Promise<{ branch: string; commit: string }> {
  try {
    const envBranch = process.env.GRC_BRANCH;
    const { stdout: rawBranch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
    const branch = rawBranch.trim() === "HEAD" && envBranch ? envBranch : rawBranch.trim();
    const { stdout: commit } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: repoPath });
    return { branch, commit: commit.trim() };
  } catch {
    return { branch: process.env.GRC_BRANCH || "unknown", commit: "unknown" };
  }
}

async function getRepoName(repoPath: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["remote", "get-url", "origin"], { cwd: repoPath });
    const match = stdout.trim().match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match ? match[1] : repoPath.split("/").pop() || "unknown";
  } catch {
    return repoPath.split("/").pop() || "unknown";
  }
}

import type { AuthFinding } from "./rules/access-controls.js";

export interface ScanResult {
  manifest: Manifest;
  authFindings: AuthFinding[];
}

export async function scan(repoPath: string, siteUrl: string | null): Promise<ScanResult> {
  const fullPath = resolve(repoPath);
  const gitInfo = await getGitInfo(fullPath);
  const repoName = await getRepoName(fullPath);

  const ctx: ScanContext = {
    repoPath: fullPath,
    repoName,
    branch: gitInfo.branch,
    commit: gitInfo.commit,
    siteUrl,
  };

  console.log(`\n🔍 GRC Compliance Scan`);
  console.log(`   Repo: ${repoName}`);
  console.log(`   Branch: ${gitInfo.branch} (${gitInfo.commit})`);
  if (siteUrl) console.log(`   Live URL: ${siteUrl}`);
  console.log("");

  // Run all static scans in parallel
  console.log("   Scanning...");
  const [
    formData,
    { services, deps },
    cookieData,
    endpointData,
    secretsData,
    trackingData,
    artifacts,
    { controls: accessControls, findings: authFindings },
  ] = await Promise.all([
    scanForms(ctx).then(r => { console.log(`   ✓ Forms: ${r.length} found`); return r; }),
    scanDependencies(ctx).then(r => { console.log(`   ✓ Dependencies: ${r.services.length} third-party services`); return r; }),
    scanCookies(ctx).then(r => { console.log(`   ✓ Cookies: ${r.length} found`); return r; }),
    scanEndpoints(ctx).then(r => { console.log(`   ✓ Endpoints: ${r.length} POST handlers`); return r; }),
    scanSecrets(ctx).then(r => { console.log(`   ✓ Secrets: ${r.findings.length} potential leaks`); return r; }),
    scanTracking(ctx).then(r => { console.log(`   ✓ Tracking: ${r.length} services`); return r; }),
    scanArtifacts(ctx).then(r => { console.log(`   ✓ Artifacts: checked`); return r; }),
    scanAccessControls(ctx).then(r => { console.log(`   ✓ Access controls: ${r.findings.length} findings`); return r; }),
  ]);

  // Run live checks (optional, sequential to avoid hammering)
  let securityHeaders = null;
  let tls = null;
  if (siteUrl) {
    console.log("\n   Running live checks...");
    securityHeaders = await scanSecurityHeaders(ctx);
    console.log(`   ✓ Security headers: ${securityHeaders ? "checked" : "unreachable"}`);
    tls = await scanTls(ctx);
    console.log(`   ✓ TLS: ${tls ? "checked" : "unreachable"}`);
  }

  // Merge data collection points, deduplicating by location
  const allDataCollection = [...formData, ...cookieData, ...endpointData, ...trackingData];
  const seenLocations = new Set<string>();
  const deduped = allDataCollection.filter(d => {
    const key = `${d.location}:${d.type}`;
    if (seenLocations.has(key)) return false;
    seenLocations.add(key);
    return true;
  });

  // Merge third-party services from dependency scan and tracking scan
  const allServices = [...services];
  for (const tracking of trackingData) {
    if (!allServices.find(s => s.name === tracking.processor)) {
      allServices.push({
        name: tracking.processor,
        purpose: "analytics/tracking",
        dataShared: tracking.fields,
        dpaUrl: null,
      });
    }
  }

  const manifest: Manifest = {
    repo: repoName,
    scanDate: new Date().toISOString(),
    branch: gitInfo.branch,
    commit: gitInfo.commit,
    dataCollection: deduped,
    thirdPartyServices: allServices,
    securityHeaders,
    https: tls,
    dependencies: deps,
    secretsScan: secretsData,
    artifacts,
    accessControls,
  };

  return { manifest, authFindings };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const repoPath = args[0] || ".";
  const siteUrl = args.find(a => a.startsWith("--url="))?.split("=")[1] || null;
  const outputDir = args.find(a => a.startsWith("--output="))?.split("=")[1] || null;

  const { manifest, authFindings } = await scan(repoPath, siteUrl);

  // Write manifest
  const outDir = outputDir || resolve(repoPath, ".grc");
  await mkdir(outDir, { recursive: true });
  const manifestPath = resolve(outDir, "manifest.yml");
  await writeFile(manifestPath, stringify(manifest), "utf-8");

  console.log(`\n📋 Manifest written to ${manifestPath}`);

  // Load config and render policies
  const config = await loadConfig(repoPath);
  const renderCtx = { manifest, config };
  const [privacyPolicy, termsOfService, vulnDisclosure, irp] = await Promise.all([
    renderPrivacyPolicy(renderCtx),
    renderTermsOfService(renderCtx),
    renderVulnerabilityDisclosure(renderCtx),
    renderIncidentResponsePlan(renderCtx),
  ]);

  const securityTxt = generateSecurityTxt(config);

  const policyPath = resolve(outDir, "privacy-policy.md");
  const tosPath = resolve(outDir, "terms-of-service.md");
  const vulnPath = resolve(outDir, "vulnerability-disclosure.md");
  const irpPath = resolve(outDir, "incident-response-plan.md");
  const securityTxtPath = resolve(outDir, "security.txt");
  await Promise.all([
    writeFile(policyPath, privacyPolicy, "utf-8"),
    writeFile(tosPath, termsOfService, "utf-8"),
    writeFile(vulnPath, vulnDisclosure, "utf-8"),
    writeFile(irpPath, irp, "utf-8"),
    writeFile(securityTxtPath, securityTxt, "utf-8"),
  ]);

  console.log(`📄 Privacy policy written to ${policyPath}`);
  console.log(`📄 Terms of service written to ${tosPath}`);
  // Generate security headers report if live checks were run
  if (manifest.securityHeaders) {
    const headerRecs = generateHeaderRecommendations(manifest, config);
    const headerReport = generateHeaderReport(headerRecs);
    const headerReportPath = resolve(outDir, "security-headers-report.md");
    await writeFile(headerReportPath, headerReport, "utf-8");
    console.log(`📄 Security headers report written to ${headerReportPath}`);
  }

  // Generate access controls report
  const acReport = generateAccessControlReport(manifest.accessControls, authFindings);
  const acReportPath = resolve(outDir, "access-controls-report.md");
  await writeFile(acReportPath, acReport, "utf-8");
  console.log(`📄 Access controls report written to ${acReportPath}`);

  // Generate risk assessment
  const risks = assessRisks(manifest, config, authFindings);
  const riskReport = generateRiskAssessment(risks, manifest, config);
  const riskReportPath = resolve(outDir, "risk-assessment.md");
  await writeFile(riskReportPath, riskReport, "utf-8");
  console.log(`📄 Risk assessment written to ${riskReportPath} (${risks.length} risks found)`);

  // Generate framework compliance report
  const frameworkResults = evaluateFramework(manifest);
  const frameworkReport = generateFrameworkReport(frameworkResults, manifest, config);
  const frameworkReportPath = resolve(outDir, "nist-csf-report.md");
  await writeFile(frameworkReportPath, frameworkReport, "utf-8");
  const applicable = frameworkResults.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const partial = applicable.filter(r => r.status === "partial").length;
  const overallPct = Math.round(((passed + partial * 0.5) / applicable.length) * 100);
  console.log(`📄 NIST CSF report written to ${frameworkReportPath} (${overallPct}% compliant)`);

  // Run AI enhancements (optional — graceful degradation)
  const aiEnhancements = await runAIEnhancements(config, manifest, risks, frameworkResults);
  if (aiEnhancements) {
    const aiReport = generateAIReport(aiEnhancements, risks, config);
    const aiReportPath = resolve(outDir, "ai-analysis.md");
    await writeFile(aiReportPath, aiReport, "utf-8");
    console.log(`🤖 AI analysis written to ${aiReportPath}`);

    // Write PR comment to a separate file for GitHub Action to pick up
    if (aiEnhancements.prSummary) {
      const prCommentPath = resolve(outDir, "pr-comment.md");
      await writeFile(prCommentPath, aiEnhancements.prSummary, "utf-8");
    }
  }

  console.log(`📄 Vulnerability disclosure written to ${vulnPath}`);
  console.log(`📄 Incident response plan written to ${irpPath}`);
  console.log(`📄 security.txt written to ${securityTxtPath}`);

  // Print summary
  console.log("\n── Summary ──────────────────────────────");
  console.log(`   Data collection points: ${manifest.dataCollection.length}`);
  console.log(`   Third-party services:   ${manifest.thirdPartyServices.length}`);
  console.log(`   Secrets detected:       ${manifest.secretsScan.detected ? "⚠️  YES" : "✅ No"}`);
  if (manifest.securityHeaders) {
    const headers = manifest.securityHeaders;
    const present = Object.values(headers).filter(v => v === "present").length;
    const total = Object.keys(headers).length;
    console.log(`   Security headers:       ${present}/${total}`);
  }
  if (manifest.https) {
    console.log(`   HTTPS enforced:         ${manifest.https.enforced ? "✅" : "❌"}`);
    console.log(`   Cert expiry:            ${manifest.https.certExpiry || "unknown"}`);
  }
  if (manifest.dependencies) {
    const d = manifest.dependencies;
    const vulns = d.criticalVulnerabilities + d.highVulnerabilities;
    console.log(`   Critical/High vulns:    ${vulns > 0 ? "⚠️  " + vulns : "✅ 0"}`);
  }
  console.log(`   Privacy Policy:         ${manifest.artifacts.privacyPolicy}`);
  console.log(`   Terms of Service:       ${manifest.artifacts.termsOfService}`);
  console.log(`   security.txt:           ${manifest.artifacts.securityTxt}`);
  console.log(`   Vuln Disclosure:        ${manifest.artifacts.vulnerabilityDisclosure}`);
  console.log(`   Incident Response Plan: ${manifest.artifacts.incidentResponsePlan}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch(e => {
  console.error("Scan failed:", e);
  process.exit(1);
});
