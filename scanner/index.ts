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
import { ScanContext, Manifest } from "./types.js";
import { loadConfig } from "./config.js";
import { renderPrivacyPolicy, renderTermsOfService, renderVulnerabilityDisclosure } from "./render.js";
import { generateSecurityTxt } from "./generators/security-txt.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function getGitInfo(repoPath: string): Promise<{ branch: string; commit: string }> {
  try {
    const { stdout: branch } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
    const { stdout: commit } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: repoPath });
    return { branch: branch.trim(), commit: commit.trim() };
  } catch {
    return { branch: "unknown", commit: "unknown" };
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

export async function scan(repoPath: string, siteUrl: string | null): Promise<Manifest> {
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
  ] = await Promise.all([
    scanForms(ctx).then(r => { console.log(`   ✓ Forms: ${r.length} found`); return r; }),
    scanDependencies(ctx).then(r => { console.log(`   ✓ Dependencies: ${r.services.length} third-party services`); return r; }),
    scanCookies(ctx).then(r => { console.log(`   ✓ Cookies: ${r.length} found`); return r; }),
    scanEndpoints(ctx).then(r => { console.log(`   ✓ Endpoints: ${r.length} POST handlers`); return r; }),
    scanSecrets(ctx).then(r => { console.log(`   ✓ Secrets: ${r.findings.length} potential leaks`); return r; }),
    scanTracking(ctx).then(r => { console.log(`   ✓ Tracking: ${r.length} services`); return r; }),
    scanArtifacts(ctx).then(r => { console.log(`   ✓ Artifacts: checked`); return r; }),
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
    accessControls: {
      branchProtection: null, // requires GitHub API — future enhancement
      requiredReviews: null,
      signedCommits: null,
    },
  };

  return manifest;
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const repoPath = args[0] || ".";
  const siteUrl = args.find(a => a.startsWith("--url="))?.split("=")[1] || null;
  const outputDir = args.find(a => a.startsWith("--output="))?.split("=")[1] || null;

  const manifest = await scan(repoPath, siteUrl);

  // Write manifest
  const outDir = outputDir || resolve(repoPath, ".grc");
  await mkdir(outDir, { recursive: true });
  const manifestPath = resolve(outDir, "manifest.yml");
  await writeFile(manifestPath, stringify(manifest), "utf-8");

  console.log(`\n📋 Manifest written to ${manifestPath}`);

  // Load config and render policies
  const config = await loadConfig(repoPath);
  const renderCtx = { manifest, config };
  const [privacyPolicy, termsOfService, vulnDisclosure] = await Promise.all([
    renderPrivacyPolicy(renderCtx),
    renderTermsOfService(renderCtx),
    renderVulnerabilityDisclosure(renderCtx),
  ]);

  const securityTxt = generateSecurityTxt(config);

  const policyPath = resolve(outDir, "privacy-policy.md");
  const tosPath = resolve(outDir, "terms-of-service.md");
  const vulnPath = resolve(outDir, "vulnerability-disclosure.md");
  const securityTxtPath = resolve(outDir, "security.txt");
  await Promise.all([
    writeFile(policyPath, privacyPolicy, "utf-8"),
    writeFile(tosPath, termsOfService, "utf-8"),
    writeFile(vulnPath, vulnDisclosure, "utf-8"),
    writeFile(securityTxtPath, securityTxt, "utf-8"),
  ]);

  console.log(`📄 Privacy policy written to ${policyPath}`);
  console.log(`📄 Terms of service written to ${tosPath}`);
  console.log(`📄 Vulnerability disclosure written to ${vulnPath}`);
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
