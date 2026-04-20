/**
 * NIST Cybersecurity Framework (CSF) 2.0 mapping.
 *
 * Subcategory IDs, function list, and category names follow NIST CSF 2.0 as
 * published 26 February 2024 (NIST.CSWP.29). Key differences from CSF 1.1
 * that are reflected here:
 *
 *   - A sixth function, GOVERN (GV), was added and is typed first in the
 *     union because CSF 2.0 positions it as the organizational core.
 *   - Subcategory identifiers are zero-padded (e.g. `ID.AM-01`, not
 *     `ID.AM-1`).
 *   - The PR.AC (Access Control) category was renamed to PR.AA (Identity
 *     Management, Authentication, and Access Control). PR.IP (Information
 *     Protection Processes) was dissolved — configuration baseline moved
 *     to PR.PS (Platform Security); vulnerability-management planning
 *     moved to ID.IM (Improvement).
 *   - DE.CM-4/DE.CM-8 consolidated into DE.CM-09 (monitoring of hardware,
 *     software, runtime environments, and their data).
 *   - Supply chain risk management now has its own category, GV.SC.
 *
 * This scanner evaluates 18 subcategories. That is a small slice of CSF
 * 2.0's ~106 total subcategories — "X% of our mapped controls" is always
 * the honest framing; full-framework compliance would need the other 88.
 */

import { Manifest } from "../types.js";

export interface FrameworkControl {
  id: string;
  function: "Govern" | "Identify" | "Protect" | "Detect" | "Respond" | "Recover";
  category: string;
  subcategory: string;
  description: string;
  check: (m: Manifest) => "pass" | "fail" | "partial" | "not-applicable";
  evidence: (m: Manifest) => string;
}

export const NIST_CSF_CONTROLS: FrameworkControl[] = [
  // ═══════════════════════════════════════════
  // GOVERN (GV) — new function in CSF 2.0
  // ═══════════════════════════════════════════
  {
    id: "GV.PO-01",
    function: "Govern",
    category: "Policy",
    subcategory: "Policy for managing cybersecurity risks is established based on organizational context, cybersecurity strategy, and priorities and is communicated and enforced",
    description: "Governance and security policy documents exist",
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
    id: "GV.SC-01",
    function: "Govern",
    category: "Cybersecurity Supply Chain Risk Management",
    subcategory: "A cybersecurity supply chain risk management program, strategy, objectives, policies, and processes are established and agreed to by organizational stakeholders",
    description: "Third-party dependencies and services are inventoried and tracked",
    check: (m) => {
      // Both dependency scanning (direct deps + their advisories) and
      // third-party-service inventory are precursors to a real supply-chain
      // risk program. Having them enabled is necessary but not sufficient.
      if (!m.dependencies) return "fail";
      if (m.thirdPartyServices.length === 0 && (m.vulnerabilities?.length ?? 0) === 0) return "partial";
      return "partial";
    },
    evidence: (m) => {
      const services = m.thirdPartyServices.length;
      const advisories = m.vulnerabilities?.length ?? 0;
      if (!m.dependencies) return "No dependency scan performed — no supply-chain inventory.";
      return `${services} third-party services identified, ${advisories} open advisories tracked. A supply-chain program additionally requires supplier agreements, risk tiering, and periodic review (not scanner-verifiable).`;
    },
  },

  // ═══════════════════════════════════════════
  // IDENTIFY (ID)
  // ═══════════════════════════════════════════
  {
    id: "ID.AM-01",
    function: "Identify",
    category: "Asset Management",
    subcategory: "Inventories of hardware managed by the organization are maintained",
    description: "Infrastructure hosting is documented",
    check: (m) => m.https?.enforced !== undefined ? "pass" : "fail",
    evidence: (m) => m.https ? `Live site checked at scan time. HTTPS enforced: ${m.https.enforced}` : "No live site URL provided",
  },
  {
    id: "ID.AM-02",
    function: "Identify",
    category: "Asset Management",
    subcategory: "Inventories of software, services, and systems managed by the organization are maintained",
    description: "Dependencies and third-party services are tracked",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: (m) => m.dependencies
      ? `${m.thirdPartyServices.length} third-party services identified. Dependency audit performed.`
      : "No dependency scan performed",
  },
  {
    id: "ID.RA-01",
    function: "Identify",
    category: "Risk Assessment",
    subcategory: "Vulnerabilities in assets are identified, validated, and recorded",
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
    id: "ID.RA-02",
    function: "Identify",
    category: "Risk Assessment",
    subcategory: "Cyber threat intelligence is received from information sharing forums and sources",
    description: "Known vulnerability databases are checked (npm audit, GitHub Advisory Database)",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: (m) => m.dependencies ? `Last audit: ${m.dependencies.lastAudit}` : "No audit performed",
  },
  {
    id: "ID.RA-08",
    function: "Identify",
    category: "Risk Assessment",
    subcategory: "Processes for receiving, analyzing, and responding to vulnerability disclosures are established",
    description: "Vulnerability disclosure process + security contact published",
    check: (m) => {
      const hasDisclosure = m.artifacts.vulnerabilityDisclosure !== "missing";
      const hasSecTxt = m.artifacts.securityTxt !== "missing";
      if (hasDisclosure && hasSecTxt) return "pass";
      if (hasDisclosure || hasSecTxt) return "partial";
      return "fail";
    },
    evidence: (m) => `security.txt: ${m.artifacts.securityTxt}, Vulnerability Disclosure: ${m.artifacts.vulnerabilityDisclosure}`,
  },
  {
    id: "ID.IM-02",
    function: "Identify",
    category: "Improvement",
    subcategory: "Security tests and exercises, including those done in coordination with suppliers and relevant third parties, are used to improve",
    description: "Automated scanning runs on code changes",
    check: (m) => m.dependencies !== null ? "pass" : "fail",
    evidence: () => "GRC scanner runs on push/PR via GitHub Actions; findings feed back into the manifest as scan-time tests.",
  },

  // ═══════════════════════════════════════════
  // PROTECT (PR)
  // ═══════════════════════════════════════════
  {
    id: "PR.AA-01",
    function: "Protect",
    category: "Identity Management, Authentication, and Access Control",
    subcategory: "Identities and credentials for authorized users, services, and hardware are managed by the organization",
    description: "No secrets/credentials in source code",
    check: (m) => m.secretsScan.detected ? "fail" : "pass",
    evidence: (m) => m.secretsScan.detected
      ? `Secrets detected: ${m.secretsScan.findings.join(", ")}`
      : "No secrets detected in source code",
  },
  {
    id: "PR.AA-05",
    function: "Protect",
    category: "Identity Management, Authentication, and Access Control",
    subcategory: "Access permissions, entitlements, and authorizations are defined in a policy, managed, enforced, and reviewed",
    description: "Branch protection and code review requirements",
    check: (m) => {
      if (m.accessControls.branchProtection === null) return "not-applicable";
      if (m.accessControls.branchProtection && (m.accessControls.requiredReviews ?? 0) >= 1) return "pass";
      if (m.accessControls.branchProtection) return "partial";
      return "fail";
    },
    evidence: (m) => {
      if (m.accessControls.branchProtection === null) return "GitHub API not reachable — cannot check";
      return `Branch protection: ${m.accessControls.branchProtection ? "enabled" : "disabled"}, Required reviews: ${m.accessControls.requiredReviews ?? "none"}`;
    },
  },
  {
    id: "PR.DS-01",
    function: "Protect",
    category: "Data Security",
    subcategory: "The confidentiality, integrity, and availability of data-at-rest are protected",
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
    id: "PR.DS-02",
    function: "Protect",
    category: "Data Security",
    subcategory: "The confidentiality, integrity, and availability of data-in-transit are protected",
    description: "HTTPS enforced with valid certificate and HSTS",
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
    id: "PR.DS-10",
    function: "Protect",
    category: "Data Security",
    subcategory: "The confidentiality, integrity, and availability of data-in-use are protected",
    description: "Security headers mitigate in-browser data leakage and tampering",
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
    id: "PR.PS-01",
    function: "Protect",
    category: "Platform Security",
    subcategory: "Configuration management practices are established and applied",
    description: "Security configuration baseline is documented and scannable",
    check: (m) => {
      return m.scanDate ? "pass" : "fail";
    },
    evidence: () => "Scanner produces manifest.yml documenting configuration baseline on every scan; diffs between scans highlight drift.",
  },

  // ═══════════════════════════════════════════
  // DETECT (DE)
  // ═══════════════════════════════════════════
  {
    id: "DE.CM-09",
    function: "Detect",
    category: "Continuous Monitoring",
    subcategory: "Computing hardware and software, runtime environments, and their data are monitored to find potentially adverse events",
    description: "Secrets scanning + dependency monitoring on every push/PR",
    check: (m) => {
      if (m.secretsScan.detected) return "fail";
      if (!m.dependencies) return "partial";
      return "pass";
    },
    evidence: (m) => {
      const s = m.secretsScan.detected ? `${m.secretsScan.findings.length} potential secrets` : "secrets clean";
      const d = m.dependencies ? `last audit ${m.dependencies.lastAudit}` : "no dependency audit";
      return `Monitoring: ${s}; ${d}.`;
    },
  },

  // ═══════════════════════════════════════════
  // RESPOND (RS)
  // ═══════════════════════════════════════════
  {
    id: "RS.MA-01",
    function: "Respond",
    category: "Incident Management",
    subcategory: "The incident response plan is executed in coordination with relevant third parties once an incident is declared",
    description: "Incident Response Plan exists",
    check: (m) => m.artifacts.incidentResponsePlan !== "missing" ? "pass" : "fail",
    evidence: (m) => `IRP status: ${m.artifacts.incidentResponsePlan}`,
  },
  {
    id: "RS.CO-02",
    function: "Respond",
    category: "Incident Response Reporting and Communication",
    subcategory: "Internal and external stakeholders are notified of incidents",
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
    id: "RC.RP-01",
    function: "Recover",
    category: "Incident Recovery Plan Execution",
    subcategory: "The recovery portion of the incident response plan is executed once initiated from the incident response process",
    description: "IRP includes recovery procedures",
    check: (m) => m.artifacts.incidentResponsePlan !== "missing" ? "pass" : "fail",
    evidence: (m) => `IRP includes recovery section: ${m.artifacts.incidentResponsePlan !== "missing" ? "yes" : "no"}`,
  },
];
