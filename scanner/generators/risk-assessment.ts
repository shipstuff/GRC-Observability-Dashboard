import { Manifest } from "../types.js";
import { SiteConfig } from "../config.js";
import type { AuthFinding } from "../rules/access-controls.js";
import { evaluateEUAIAct } from "../frameworks/eu-ai-act.js";

export interface Risk {
  id: string;
  category: "vulnerability" | "configuration" | "governance" | "data-privacy" | "operational" | "ai-compliance";
  title: string;
  description: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "mitigated" | "accepted";
  mitigation: string;
  framework: string[]; // NIST CSF, SOC 2, etc. references
}

function calcSeverity(likelihood: string, impact: string): "low" | "medium" | "high" | "critical" {
  const matrix: Record<string, Record<string, "low" | "medium" | "high" | "critical">> = {
    low:    { low: "low",    medium: "low",    high: "medium" },
    medium: { low: "low",    medium: "medium", high: "high" },
    high:   { low: "medium", medium: "high",   high: "critical" },
  };
  return matrix[likelihood]?.[impact] ?? "medium";
}

export function assessRisks(
  manifest: Manifest,
  config: SiteConfig,
  authFindings: AuthFinding[]
): Risk[] {
  const risks: Risk[] = [];
  let counter = 1;
  const id = () => `RISK-${String(counter++).padStart(3, "0")}`;

  // --- Dependency vulnerabilities ---
  if (manifest.dependencies) {
    const d = manifest.dependencies;
    if (d.criticalVulnerabilities > 0) {
      risks.push({
        id: id(),
        category: "vulnerability",
        title: "Critical dependency vulnerabilities",
        description: `${d.criticalVulnerabilities} critical vulnerability(ies) found in project dependencies. These may allow remote code execution, authentication bypass, or data exfiltration.`,
        likelihood: "high",
        impact: "high",
        severity: "critical",
        status: "open",
        mitigation: "Run `npm audit fix` or update affected packages. Review each CVE for applicability to your usage.",
        framework: ["NIST CSF ID.RA-01", "SOC 2 CC7.1", "ISO 27001 A.8.8"],
      });
    }
    if (d.highVulnerabilities > 0) {
      risks.push({
        id: id(),
        category: "vulnerability",
        title: "High-severity dependency vulnerabilities",
        description: `${d.highVulnerabilities} high-severity vulnerability(ies) in dependencies.`,
        likelihood: "medium",
        impact: "high",
        severity: "high",
        status: "open",
        mitigation: "Review each vulnerability. Apply patches where available. If no patch exists, evaluate workarounds or alternative packages.",
        framework: ["NIST CSF ID.RA-01", "SOC 2 CC7.1"],
      });
    }
  }

  // --- Security headers ---
  if (manifest.securityHeaders) {
    const h = manifest.securityHeaders;
    const missing = Object.entries(h).filter(([_, v]) => v === "missing");
    if (missing.length > 0) {
      const hasCsp = h.csp === "missing";
      const hasHsts = h.hsts === "missing";

      risks.push({
        id: id(),
        category: "configuration",
        title: `Missing security headers (${missing.length}/6)`,
        description: `${missing.length} security headers are not configured: ${missing.map(([k]) => k).join(", ")}. ${hasCsp ? "Missing CSP leaves the site vulnerable to XSS attacks. " : ""}${hasHsts ? "Missing HSTS allows SSL stripping attacks." : ""}`,
        likelihood: hasCsp ? "high" : "medium",
        impact: hasCsp ? "high" : "medium",
        severity: hasCsp ? "critical" : "medium",
        status: "open",
        mitigation: "Add security headers middleware to Express application. See security-headers-report.md for copy-paste implementation.",
        framework: ["NIST CSF PR.DS-02", "SOC 2 CC6.1", "ISO 27001 A.8.20"],
      });
    }
  }

  // --- TLS/HTTPS ---
  if (manifest.https) {
    if (!manifest.https.enforced) {
      risks.push({
        id: id(),
        category: "configuration",
        title: "HTTPS not enforced",
        description: "HTTP requests are not redirected to HTTPS. User data may be transmitted in plaintext.",
        likelihood: "high",
        impact: "high",
        severity: "critical",
        status: "open",
        mitigation: "Configure HTTP to HTTPS redirect in your server or reverse proxy.",
        framework: ["NIST CSF PR.DS-02", "SOC 2 CC6.7", "GDPR Art. 32"],
      });
    }

    if (manifest.https.certExpiry) {
      const expiry = new Date(manifest.https.certExpiry);
      const now = new Date();
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft <= 30) {
        risks.push({
          id: id(),
          category: "operational",
          title: `TLS certificate expires in ${daysLeft} days`,
          description: `Certificate expires on ${manifest.https.certExpiry}. An expired certificate will cause browser warnings and break HTTPS.`,
          likelihood: daysLeft <= 7 ? "high" : "medium",
          impact: "high",
          severity: daysLeft <= 7 ? "critical" : "high",
          status: "open",
          mitigation: "Renew certificate immediately. Consider using Let's Encrypt with auto-renewal (certbot).",
          framework: ["NIST CSF PR.DS-02", "SOC 2 CC6.7"],
        });
      }
    }
  }

  // --- Secrets ---
  if (manifest.secretsScan.detected) {
    risks.push({
      id: id(),
      category: "vulnerability",
      title: "Potential secrets detected in source code",
      description: `${manifest.secretsScan.findings.length} potential secret(s) found: ${manifest.secretsScan.findings.join("; ")}`,
      likelihood: "high",
      impact: "high",
      severity: "critical",
      status: "open",
      mitigation: "Rotate all exposed credentials immediately. Move secrets to environment variables or a secrets manager. Add patterns to .gitignore.",
      framework: ["NIST CSF PR.AA-01", "SOC 2 CC6.1", "ISO 27001 A.5.17"],
    });
  }

  // --- Access controls ---
  if (manifest.accessControls.branchProtection === false) {
    risks.push({
      id: id(),
      category: "governance",
      title: "No branch protection on main branch",
      description: "Anyone with write access can push directly to main without review. This bypasses code review, a critical governance control.",
      likelihood: "medium",
      impact: "high",
      severity: "high",
      status: "open",
      mitigation: "Enable branch protection rules: require PR reviews, status checks, and restrict direct pushes. See access-controls-report.md.",
      framework: ["NIST CSF PR.AA-05", "SOC 2 CC6.1", "ISO 27001 A.8.3"],
    });
  }

  const unprotectedRoutes = authFindings.filter(f => f.type === "unprotected-route" && f.location !== "GitHub");
  if (unprotectedRoutes.length > 0) {
    risks.push({
      id: id(),
      category: "vulnerability",
      title: "Potentially unprotected sensitive routes",
      description: `${unprotectedRoutes.length} route(s) appear to handle sensitive operations without authentication: ${unprotectedRoutes.map(f => f.detail).join("; ")}`,
      likelihood: "medium",
      impact: "high",
      severity: "high",
      status: "open",
      mitigation: "Add authentication middleware to all admin, settings, and destructive routes.",
      framework: ["NIST CSF PR.AA-01", "SOC 2 CC6.1"],
    });
  }

  // --- Missing governance artifacts ---
  const missingArtifacts: string[] = [];
  if (manifest.artifacts.privacyPolicy === "missing") missingArtifacts.push("Privacy Policy");
  if (manifest.artifacts.termsOfService === "missing") missingArtifacts.push("Terms of Service");
  if (manifest.artifacts.securityTxt === "missing") missingArtifacts.push("security.txt");
  if (manifest.artifacts.vulnerabilityDisclosure === "missing") missingArtifacts.push("Vulnerability Disclosure");
  if (manifest.artifacts.incidentResponsePlan === "missing") missingArtifacts.push("Incident Response Plan");

  if (missingArtifacts.length > 0) {
    risks.push({
      id: id(),
      category: "governance",
      title: `Missing governance documents (${missingArtifacts.length})`,
      description: `The following required documents are not deployed: ${missingArtifacts.join(", ")}. This creates compliance gaps and may violate GDPR/CCPA requirements.`,
      likelihood: "medium",
      impact: missingArtifacts.includes("Privacy Policy") ? "high" : "medium",
      severity: missingArtifacts.includes("Privacy Policy") ? "high" : "medium",
      status: "open",
      mitigation: "Deploy the auto-generated documents from the .grc/ directory to the live site.",
      framework: ["NIST CSF GV.PO-01", "SOC 2 CC1.1", "GDPR Art. 13", "CCPA §1798.100 (as amended by CPRA)"],
    });
  }

  // --- Data privacy: third-party processors without DPA ---
  const noDpa = manifest.thirdPartyServices.filter(s => !s.dpaUrl);
  if (noDpa.length > 0) {
    risks.push({
      id: id(),
      category: "data-privacy",
      title: "Third-party processors without DPA on file",
      description: `${noDpa.length} third-party service(s) process user data but have no documented Data Processing Agreement: ${noDpa.map(s => s.name).join(", ")}. Under GDPR, a DPA is required with all data processors.`,
      likelihood: "medium",
      impact: "medium",
      severity: "medium",
      status: "open",
      mitigation: "Obtain and review the DPA from each processor. Add the DPA URL to .grc/config.yml or the known services list.",
      framework: ["GDPR Art. 28", "SOC 2 CC9.2"],
    });
  }

  // --- Data privacy: unknown retention ---
  const unknownRetention = manifest.dataCollection.filter(d => d.retention === "unknown");
  if (unknownRetention.length > 0) {
    risks.push({
      id: id(),
      category: "data-privacy",
      title: "Undefined data retention periods",
      description: `${unknownRetention.length} data collection point(s) have no defined retention period. GDPR requires clear data retention policies.`,
      likelihood: "low",
      impact: "medium",
      severity: "low",
      status: "open",
      mitigation: "Define retention periods for each data collection point in .grc/config.yml. Implement automated data deletion where appropriate.",
      framework: ["GDPR Art. 5(1)(e)", "NIST CSF PR.DS-01"],
    });
  }

  // --- AI compliance risks (EU AI Act) ---
  // One Risk per failing/partial article. Likelihood and impact are derived
  // from the risk tier of the in-scope systems — a failed Article 5 check
  // (prohibited practice) is critical; a partial Article 4 (AI literacy) on
  // a minimal-risk system is low. Articles that are `not-applicable` in the
  // manifest produce no risk entries at all.
  const aiResults = evaluateEUAIAct(manifest);
  const aiSystems = manifest.aiSystems || [];
  const hasHighRisk = aiSystems.some(s => s.riskTier === "high" || s.riskTier === "prohibited");
  const hasProhibited = aiSystems.some(s => s.riskTier === "prohibited");

  for (const result of aiResults) {
    if (result.status === "pass" || result.status === "not-applicable") continue;

    let likelihood: "low" | "medium" | "high";
    let impact: "low" | "medium" | "high";

    if (result.articleId === "ART-5" && hasProhibited) {
      likelihood = "high";
      impact = "high";
    } else if (result.status === "fail" && hasHighRisk) {
      likelihood = "high";
      impact = "high";
    } else if (result.status === "fail") {
      likelihood = "medium";
      impact = "medium";
    } else {
      // partial
      likelihood = hasHighRisk ? "medium" : "low";
      impact = hasHighRisk ? "medium" : "low";
    }

    risks.push({
      id: id(),
      category: "ai-compliance",
      title: `EU AI Act ${result.articleId} — ${result.title}`,
      description: result.evidence,
      likelihood,
      impact,
      severity: calcSeverity(likelihood, impact),
      status: "open",
      mitigation: `Review EU AI Act Article ${result.article}. Document or implement the missing control; when the scanner's artifact check turns "present", this risk will downgrade or close automatically. Override risk tier or declare eu_market under ai_systems in .grc/config.yml if the article does not apply to this system.`,
      framework: [
        `EU AI Act Art. ${result.article}`,
        ...(result.nistAiRmf.length > 0 ? [`NIST AI RMF ${result.nistAiRmf.join(", ")}`] : []),
        ...(result.iso42001.length > 0 ? [`ISO/IEC 42001 ${result.iso42001.join(", ")}`] : []),
      ],
    });
  }

  return risks;
}

export function generateRiskAssessment(risks: Risk[], manifest: Manifest, config: SiteConfig): string {
  const lines: string[] = [
    `# Risk Assessment — ${config.siteName}\n`,
    `**Scope:** ${config.siteUrl}`,
    `**Date:** ${new Date(manifest.scanDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `**Assessor:** GRC Observability Dashboard (automated)`,
    `**Branch:** ${manifest.branch} (${manifest.commit})\n`,
    "---\n",
  ];

  // Executive summary
  const critical = risks.filter(r => r.severity === "critical");
  const high = risks.filter(r => r.severity === "high");
  const medium = risks.filter(r => r.severity === "medium");
  const low = risks.filter(r => r.severity === "low");

  lines.push("## Executive Summary\n");
  lines.push(`This automated risk assessment identified **${risks.length} risks** across the scanned codebase and live site:\n`);
  lines.push("| Severity | Count |");
  lines.push("|----------|-------|");
  if (critical.length) lines.push(`| CRITICAL | ${critical.length} |`);
  if (high.length) lines.push(`| HIGH | ${high.length} |`);
  if (medium.length) lines.push(`| MEDIUM | ${medium.length} |`);
  if (low.length) lines.push(`| LOW | ${low.length} |`);
  lines.push("");

  if (critical.length > 0) {
    lines.push(`**Immediate action required** on ${critical.length} critical risk(s).\n`);
  }

  // Risk matrix
  lines.push("## Risk Matrix\n");
  lines.push("```");
  lines.push("         │  Low Impact  │  Med Impact  │ High Impact  ");
  lines.push("─────────┼──────────────┼──────────────┼──────────────");

  const countAt = (l: string, i: string) =>
    risks.filter(r => r.likelihood === l && r.impact === i).length;

  const cell = (n: number) => n > 0 ? `    ${n}x       ` : `     -        `;

  lines.push(`High     │${cell(countAt("high", "low"))}│${cell(countAt("high", "medium"))}│${cell(countAt("high", "high"))}`);
  lines.push(`Medium   │${cell(countAt("medium", "low"))}│${cell(countAt("medium", "medium"))}│${cell(countAt("medium", "high"))}`);
  lines.push(`Low      │${cell(countAt("low", "low"))}│${cell(countAt("low", "medium"))}│${cell(countAt("low", "high"))}`);
  lines.push("```");
  lines.push("*Rows = likelihood, Columns = impact*\n");

  lines.push("---\n");

  // Detailed findings
  lines.push("## Detailed Findings\n");

  // Sort: critical first, then high, medium, low
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...risks].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  for (const r of sorted) {
    const severityBadge = r.severity === "critical" ? "CRITICAL"
      : r.severity === "high" ? "HIGH"
      : r.severity === "medium" ? "MEDIUM" : "LOW";

    lines.push(`### ${r.id}: ${r.title}\n`);
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Severity | **${severityBadge}** |`);
    lines.push(`| Category | ${r.category} |`);
    lines.push(`| Likelihood | ${r.likelihood} |`);
    lines.push(`| Impact | ${r.impact} |`);
    lines.push(`| Status | ${r.status} |`);
    lines.push(`| Frameworks | ${r.framework.join(", ")} |`);
    lines.push("");
    lines.push(`**Description:** ${r.description}\n`);
    lines.push(`**Recommended Mitigation:** ${r.mitigation}\n`);
    lines.push("---\n");
  }

  // Methodology
  lines.push("## Methodology\n");
  lines.push("This risk assessment was generated automatically by the GRC Observability Dashboard scanner. Risks are identified from:\n");
  lines.push("- Static code analysis (data collection, secrets, auth patterns)");
  lines.push("- Dependency vulnerability scanning (npm audit)");
  lines.push("- Live site checks (security headers, TLS configuration)");
  lines.push("- Repository configuration (branch protection, access controls)");
  lines.push("- Governance artifact checks (policies, disclosure documents)\n");
  lines.push("**Risk severity** is calculated using a standard likelihood x impact matrix. Framework mappings reference NIST CSF, SOC 2, ISO 27001, and GDPR/CCPA where applicable.\n");
  lines.push("This assessment should be reviewed by a human and supplemented with threat modeling and business context that automated scanning cannot capture.\n");

  return lines.join("\n");
}
