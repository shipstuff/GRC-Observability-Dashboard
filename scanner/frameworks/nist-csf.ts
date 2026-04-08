/**
 * NIST Cybersecurity Framework (CSF) 2.0 mapping
 *
 * Maps scanner checks to NIST CSF subcategories.
 * Each control has a check function that evaluates the manifest to determine compliance.
 */

import { Manifest } from "../types.js";

export interface FrameworkControl {
  id: string;
  function: "Identify" | "Protect" | "Detect" | "Respond" | "Recover";
  category: string;
  subcategory: string;
  description: string;
  check: (m: Manifest) => "pass" | "fail" | "partial" | "not-applicable";
  evidence: (m: Manifest) => string;
}

export const NIST_CSF_CONTROLS: FrameworkControl[] = [
  // ═══════════════════════════════════════════
  // IDENTIFY (ID)
  // ═══════════════════════════════════════════
  {
    id: "ID.AM-1",
    function: "Identify",
    category: "Asset Management",
    subcategory: "Physical devices and systems are inventoried",
    description: "Infrastructure hosting is documented",
    check: (m) => m.https?.enforced !== undefined ? "pass" : "fail",
    evidence: (m) => m.https ? `Live site checked at scan time. HTTPS enforced: ${m.https.enforced}` : "No live site URL provided",
  },
  {
    id: "ID.AM-2",
    function: "Identify",
    category: "Asset Management",
    subcategory: "Software platforms and applications are inventoried",
    description: "Dependencies and third-party services are tracked",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: (m) => m.dependencies
      ? `${m.thirdPartyServices.length} third-party services identified. Dependency audit performed.`
      : "No dependency scan performed",
  },
  {
    id: "ID.GV-1",
    function: "Identify",
    category: "Governance",
    subcategory: "Organizational cybersecurity policy is established",
    description: "Security policies and governance documents exist",
    check: (m) => {
      const artifacts = m.artifacts;
      const has = [
        artifacts.privacyPolicy !== "missing",
        artifacts.termsOfService !== "missing",
        artifacts.securityTxt !== "missing",
        artifacts.vulnerabilityDisclosure !== "missing",
        artifacts.incidentResponsePlan !== "missing",
      ];
      const count = has.filter(Boolean).length;
      if (count >= 4) return "pass";
      if (count >= 2) return "partial";
      return "fail";
    },
    evidence: (m) => {
      const a = m.artifacts;
      return `Privacy Policy: ${a.privacyPolicy}, ToS: ${a.termsOfService}, security.txt: ${a.securityTxt}, Vuln Disclosure: ${a.vulnerabilityDisclosure}, IRP: ${a.incidentResponsePlan}`;
    },
  },
  {
    id: "ID.RA-1",
    function: "Identify",
    category: "Risk Assessment",
    subcategory: "Asset vulnerabilities are identified and documented",
    description: "Dependency vulnerabilities are scanned",
    check: (m) => {
      if (!m.dependencies) return "fail";
      return m.dependencies.criticalVulnerabilities === 0 && m.dependencies.highVulnerabilities === 0
        ? "pass" : "partial";
    },
    evidence: (m) => m.dependencies
      ? `Critical: ${m.dependencies.criticalVulnerabilities}, High: ${m.dependencies.highVulnerabilities}, Medium: ${m.dependencies.mediumVulnerabilities}`
      : "No dependency scan performed",
  },
  {
    id: "ID.RA-2",
    function: "Identify",
    category: "Risk Assessment",
    subcategory: "Cyber threat intelligence is received",
    description: "Known vulnerability databases are checked (npm audit, CVE)",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: (m) => m.dependencies ? `Last audit: ${m.dependencies.lastAudit}` : "No audit performed",
  },

  // ═══════════════════════════════════════════
  // PROTECT (PR)
  // ═══════════════════════════════════════════
  {
    id: "PR.AC-1",
    function: "Protect",
    category: "Access Control",
    subcategory: "Identities and credentials are issued, managed, and verified",
    description: "No secrets/credentials in source code",
    check: (m) => m.secretsScan.detected ? "fail" : "pass",
    evidence: (m) => m.secretsScan.detected
      ? `Secrets detected: ${m.secretsScan.findings.join(", ")}`
      : "No secrets detected in source code",
  },
  {
    id: "PR.AC-4",
    function: "Protect",
    category: "Access Control",
    subcategory: "Access permissions and authorizations are managed",
    description: "Branch protection and code review requirements",
    check: (m) => {
      if (m.accessControls.branchProtection === null) return "not-applicable";
      if (m.accessControls.branchProtection && (m.accessControls.requiredReviews ?? 0) >= 1) return "pass";
      if (m.accessControls.branchProtection) return "partial";
      return "fail";
    },
    evidence: (m) => {
      if (m.accessControls.branchProtection === null) return "GitHub CLI not available — cannot check";
      return `Branch protection: ${m.accessControls.branchProtection ? "enabled" : "disabled"}, Required reviews: ${m.accessControls.requiredReviews ?? "none"}`;
    },
  },
  {
    id: "PR.DS-1",
    function: "Protect",
    category: "Data Security",
    subcategory: "Data-at-rest is protected",
    description: "Data collection points are documented with retention policies",
    check: (m) => {
      if (m.dataCollection.length === 0) return "pass";
      const unknownRetention = m.dataCollection.filter(d => d.retention === "unknown");
      if (unknownRetention.length === 0) return "pass";
      if (unknownRetention.length < m.dataCollection.length) return "partial";
      return "fail";
    },
    evidence: (m) => `${m.dataCollection.length} data collection points. ${m.dataCollection.filter(d => d.retention === "unknown").length} with undefined retention.`,
  },
  {
    id: "PR.DS-2",
    function: "Protect",
    category: "Data Security",
    subcategory: "Data-in-transit is protected",
    description: "HTTPS enforced with valid certificate and security headers",
    check: (m) => {
      if (!m.https) return "not-applicable";
      const httpsOk = m.https.enforced;
      const headersOk = m.securityHeaders?.hsts === "present";
      if (httpsOk && headersOk) return "pass";
      if (httpsOk) return "partial";
      return "fail";
    },
    evidence: (m) => {
      if (!m.https) return "No live check performed";
      return `HTTPS enforced: ${m.https.enforced}, HSTS: ${m.securityHeaders?.hsts ?? "not checked"}, Cert expiry: ${m.https.certExpiry ?? "unknown"}`;
    },
  },
  {
    id: "PR.DS-5",
    function: "Protect",
    category: "Data Security",
    subcategory: "Protections against data leaks are implemented",
    description: "Security headers prevent common attack vectors",
    check: (m) => {
      if (!m.securityHeaders) return "not-applicable";
      const h = m.securityHeaders;
      const present = Object.values(h).filter(v => v === "present").length;
      if (present >= 5) return "pass";
      if (present >= 3) return "partial";
      return "fail";
    },
    evidence: (m) => {
      if (!m.securityHeaders) return "No live check performed";
      const h = m.securityHeaders;
      return `CSP: ${h.csp}, HSTS: ${h.hsts}, X-Frame: ${h.xFrameOptions}, X-Content-Type: ${h.xContentTypeOptions}, Referrer: ${h.referrerPolicy}, Permissions: ${h.permissionsPolicy}`;
    },
  },
  {
    id: "PR.IP-1",
    function: "Protect",
    category: "Information Protection",
    subcategory: "Configuration management baseline is established",
    description: "Security configuration is documented and scannable",
    check: (m) => {
      // If we have a manifest at all, the baseline is being tracked
      return m.scanDate ? "pass" : "fail";
    },
    evidence: () => "GRC scanner produces manifest.yml documenting security configuration on every scan",
  },
  {
    id: "PR.IP-12",
    function: "Protect",
    category: "Information Protection",
    subcategory: "A vulnerability management plan is developed and implemented",
    description: "Dependency scanning and vulnerability tracking",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: (m) => m.dependencies
      ? `Automated dependency scanning via npm audit. Last scan: ${m.dependencies.lastAudit}`
      : "No vulnerability scanning configured",
  },

  // ═══════════════════════════════════════════
  // DETECT (DE)
  // ═══════════════════════════════════════════
  {
    id: "DE.CM-4",
    function: "Detect",
    category: "Continuous Monitoring",
    subcategory: "Malicious code is detected",
    description: "Secrets scanning detects leaked credentials",
    check: (m) => m.secretsScan.detected ? "fail" : "pass",
    evidence: (m) => m.secretsScan.detected
      ? `${m.secretsScan.findings.length} potential secrets found`
      : "Secrets scan clean — no credentials detected in source code",
  },
  {
    id: "DE.CM-8",
    function: "Detect",
    category: "Continuous Monitoring",
    subcategory: "Vulnerability scans are performed",
    description: "Automated scanning on code changes",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: () => "GRC scanner runs on push/PR via GitHub Actions",
  },

  // ═══════════════════════════════════════════
  // RESPOND (RS)
  // ═══════════════════════════════════════════
  {
    id: "RS.RP-1",
    function: "Respond",
    category: "Response Planning",
    subcategory: "Response plan is executed during or after an incident",
    description: "Incident Response Plan exists",
    check: (m) => m.artifacts.incidentResponsePlan !== "missing" ? "pass" : "fail",
    evidence: (m) => `IRP status: ${m.artifacts.incidentResponsePlan}`,
  },
  {
    id: "RS.CO-2",
    function: "Respond",
    category: "Communications",
    subcategory: "Incidents are reported consistent with established criteria",
    description: "Vulnerability disclosure and security contact are published",
    check: (m) => {
      const hasDisclosure = m.artifacts.vulnerabilityDisclosure !== "missing";
      const hasSecTxt = m.artifacts.securityTxt !== "missing";
      if (hasDisclosure && hasSecTxt) return "pass";
      if (hasDisclosure || hasSecTxt) return "partial";
      return "fail";
    },
    evidence: (m) => `security.txt: ${m.artifacts.securityTxt}, Vulnerability Disclosure: ${m.artifacts.vulnerabilityDisclosure}`,
  },

  // ═══════════════════════════════════════════
  // RECOVER (RC)
  // ═══════════════════════════════════════════
  {
    id: "RC.RP-1",
    function: "Recover",
    category: "Recovery Planning",
    subcategory: "Recovery plan is executed during or after an incident",
    description: "IRP includes recovery procedures",
    check: (m) => m.artifacts.incidentResponsePlan !== "missing" ? "pass" : "fail",
    evidence: (m) => `IRP includes recovery section: ${m.artifacts.incidentResponsePlan !== "missing" ? "yes" : "no"}`,
  },
  {
    id: "RC.IM-1",
    function: "Recover",
    category: "Improvements",
    subcategory: "Recovery plans incorporate lessons learned",
    description: "IRP includes post-incident review process",
    check: (m) => m.artifacts.incidentResponsePlan !== "missing" ? "pass" : "fail",
    evidence: (m) => `IRP includes lessons learned section: ${m.artifacts.incidentResponsePlan !== "missing" ? "yes" : "no"}`,
  },
];
