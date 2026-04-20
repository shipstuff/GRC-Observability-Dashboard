import type { Manifest } from "../../types.js";

/**
 * Minimal SARIF 2.1.0 generator. The spec is huge (dozens of optional
 * fields, taxonomies, invocations, fingerprints, flow graphs…) but GitHub's
 * code-scanning endpoint only strictly requires a small subset. We emit the
 * required fields plus the ones that make the output useful in the GitHub
 * Security tab: ruleId, severity, message, physicalLocation with an
 * artifactLocation URI relative to the repo root.
 *
 * SARIF reference: https://docs.oasis-open.org/sarif/sarif/v2.1.0/
 * GitHub-specific notes: https://docs.github.com/code-security/code-scanning/
 *   integrating-with-code-scanning/sarif-support-for-code-scanning
 */

// Only the fields we actually populate — a local structural subset.
interface SarifRegion {
  startLine: number;
}

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note" | "none";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: SarifRegion;
    };
  }>;
  partialFingerprints?: Record<string, string>;
  properties?: Record<string, unknown>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  helpUri?: string;
  defaultConfiguration?: { level: "error" | "warning" | "note" | "none" };
  properties?: { tags?: string[] };
}

const SCANNER_NAME = "grc-observability-dashboard";
const SCANNER_INFO_URI = "https://github.com/shipstuff/GRC-Observability-Dashboard";

// --- Rule catalog ---------------------------------------------------------

const RULES: SarifRule[] = [
  {
    id: "grc/secret-leak",
    name: "SecretLeak",
    shortDescription: { text: "A credential-like string was detected in source." },
    fullDescription: { text: "API keys, bearer tokens, OAuth secrets, or private keys embedded in committed source. Rotate the credential and move it to a secret store." },
    helpUri: `${SCANNER_INFO_URI}#secrets`,
    defaultConfiguration: { level: "error" },
    properties: { tags: ["security", "secret"] },
  },
  {
    id: "grc/dependency-vulnerability",
    name: "DependencyVulnerability",
    shortDescription: { text: "A dependency has a published security advisory." },
    fullDescription: { text: "A package in the dependency tree has a known CVE or advisory. Consult the advisory URL and upgrade to a patched version where available." },
    helpUri: `${SCANNER_INFO_URI}#dependencies`,
    defaultConfiguration: { level: "warning" },
    properties: { tags: ["security", "vulnerability"] },
  },
  {
    id: "grc/unprotected-route",
    name: "UnprotectedRoute",
    shortDescription: { text: "An admin or sensitive route appears to lack authentication." },
    fullDescription: { text: "A route matching an admin / destructive pattern was found with no auth middleware detected in the same file. Verify that access is restricted before shipping." },
    helpUri: `${SCANNER_INFO_URI}#access-controls`,
    defaultConfiguration: { level: "warning" },
    properties: { tags: ["security", "authentication"] },
  },
  {
    id: "grc/ai-prohibited",
    name: "AIProhibited",
    shortDescription: { text: "An AI system was flagged as potentially prohibited under EU AI Act Article 5." },
    fullDescription: { text: "Path keywords matched social-scoring, subliminal manipulation, or vulnerability exploitation contexts. Verify the use case; if misclassified, override risk_tier in .grc/config.yml." },
    helpUri: `${SCANNER_INFO_URI}#eu-ai-act`,
    defaultConfiguration: { level: "error" },
    properties: { tags: ["ai-compliance", "eu-ai-act", "art-5"] },
  },
  {
    id: "grc/ai-high-risk",
    name: "AIHighRisk",
    shortDescription: { text: "An AI system was classified as high-risk under EU AI Act Annex III." },
    fullDescription: { text: "Path keywords suggest the system operates in employment, credit, healthcare, education, or biometric domains. Article 9/11/12/13/14/15/27 obligations likely apply." },
    helpUri: `${SCANNER_INFO_URI}#eu-ai-act`,
    defaultConfiguration: { level: "warning" },
    properties: { tags: ["ai-compliance", "eu-ai-act", "annex-iii"] },
  },
];

const RULE_INDEX = new Map<string, number>(RULES.map((r, i) => [r.id, i]));

// --- Location helpers -----------------------------------------------------

/**
 * Many scanner findings ship their location as "file.ts" or "file.ts:42" —
 * split into a URI + optional region. Paths are kept repo-relative because
 * GitHub expects that; we'd need a base URI config to produce absolute URIs.
 */
function parseLocation(raw: string): {
  uri: string;
  region?: SarifRegion;
} {
  // Strip any leading ./ and trim.
  const trimmed = raw.trim().replace(/^\.\//, "");
  const match = trimmed.match(/^(.+?):(\d+)(?::\d+)?$/);
  if (match) {
    return { uri: match[1]!, region: { startLine: Number(match[2]) } };
  }
  return { uri: trimmed };
}

function buildSecretsResults(manifest: Manifest): SarifResult[] {
  const findings = manifest.secretsScan?.findings ?? [];
  return findings.map(finding => {
    const loc = parseLocation(finding);
    return {
      ruleId: "grc/secret-leak",
      level: "error" as const,
      message: { text: `Potential credential detected in ${loc.uri}.` },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: loc.uri },
          ...(loc.region ? { region: loc.region } : {}),
        },
      }],
      partialFingerprints: {
        "grc.secret/primary": `${loc.uri}:${loc.region?.startLine ?? "0"}`,
      },
    };
  });
}

function buildVulnerabilityResults(manifest: Manifest): SarifResult[] {
  const vulns = manifest.vulnerabilities ?? [];
  return vulns.map(v => {
    const level: SarifResult["level"] =
      v.severity === "critical" ? "error" :
      v.severity === "high" ? "error" :
      v.severity === "moderate" ? "warning" :
      "note";
    return {
      ruleId: "grc/dependency-vulnerability",
      level,
      message: {
        text: `${v.package} ${v.range}: ${v.title} (${v.severity}${v.cvssScore > 0 ? `, CVSS ${v.cvssScore}` : ""})${v.fixAvailable ? " — fix available" : ""}. See ${v.url}.`,
      },
      // npm doesn't give a source-file location for the advisory — attach
      // it to package.json so the finding has somewhere to land in the UI.
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: "package.json" },
        },
      }],
      partialFingerprints: {
        "grc.advisory/id": v.advisoryId,
        "grc.advisory/package": v.package,
      },
      properties: {
        "security-severity": v.cvssScore > 0 ? String(v.cvssScore) : v.severity,
        advisoryId: v.advisoryId,
        package: v.package,
        isDirect: v.isDirect,
        fixAvailable: v.fixAvailable,
      },
    };
  });
}

function buildAccessControlResults(manifest: Manifest): SarifResult[] {
  // accessControls aggregate doesn't carry per-finding locations; the real
  // per-finding data lives in authFindings which isn't on the manifest.
  // We synthesise one SARIF result when branchProtection is disabled so
  // GitHub Security surfaces the governance gap in the PR Security tab.
  const ac = manifest.accessControls;
  if (ac?.branchProtection === false) {
    return [{
      ruleId: "grc/unprotected-route",
      level: "warning",
      message: { text: "Branch protection is disabled on this repository. Enabling branch protection with required reviewers is a baseline governance control for NIST CSF PR.AC-4 and SOC 2 CC6.1." },
      locations: [{
        physicalLocation: { artifactLocation: { uri: ".github/branch-protection.md" } },
      }],
      partialFingerprints: { "grc.governance/primary": `${manifest.repo}/branch-protection` },
    }];
  }
  return [];
}

function buildAIResults(manifest: Manifest): SarifResult[] {
  const out: SarifResult[] = [];
  for (const s of manifest.aiSystems ?? []) {
    if (!s.riskTier) continue;
    if (s.riskTier !== "prohibited" && s.riskTier !== "high") continue;

    const ruleId = s.riskTier === "prohibited" ? "grc/ai-prohibited" : "grc/ai-high-risk";
    // Emit one result per source path where the system is used; fall back
    // to the primary `location` if no usageLocations were recorded.
    const paths = s.usageLocations && s.usageLocations.length > 0
      ? s.usageLocations
      : [s.location];

    for (const path of paths) {
      out.push({
        ruleId,
        level: s.riskTier === "prohibited" ? "error" : "warning",
        message: {
          text: `${s.provider} (${s.sdk}) classified as ${s.riskTier}${s.riskTierSource === "override" ? " (user override)" : ""}. ${s.riskReasoning ?? ""}`.trim(),
        },
        locations: [{ physicalLocation: { artifactLocation: { uri: path } } }],
        partialFingerprints: {
          "grc.ai/primary": `${s.provider}@${path}`,
        },
        properties: {
          provider: s.provider,
          category: s.category,
          riskTier: s.riskTier,
          euMarket: s.euMarket ?? false,
        },
      });
    }
  }
  return out;
}

// --- Public entry point ---------------------------------------------------

export function generateSarifExport(manifest: Manifest): string {
  const results: SarifResult[] = [
    ...buildSecretsResults(manifest),
    ...buildVulnerabilityResults(manifest),
    ...buildAccessControlResults(manifest),
    ...buildAIResults(manifest),
  ];

  // Only include rules that actually produced at least one result; GitHub
  // doesn't require this, but it keeps the SARIF file focused and matches
  // common generator output.
  const usedRuleIds = new Set(results.map(r => r.ruleId));
  const rules = RULES.filter(r => usedRuleIds.has(r.id));
  // Rewire ruleIndex now that we've filtered.
  const indexMap = new Map<string, number>(rules.map((r, i) => [r.id, i]));
  const resultsWithIndex = results.map(r => ({
    ...r,
    ruleIndex: indexMap.get(r.ruleId),
  }));

  // Avoid an unused-var complaint while keeping RULE_INDEX around for
  // documentation + potential future use when we surface it from a helper.
  void RULE_INDEX;

  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: SCANNER_NAME,
          informationUri: SCANNER_INFO_URI,
          version: "1.0.0",
          rules,
        },
      },
      invocations: [{
        executionSuccessful: true,
        startTimeUtc: manifest.scanDate,
        endTimeUtc: manifest.scanDate,
      }],
      versionControlProvenance: [{
        repositoryUri: `https://github.com/${manifest.repo}`,
        revisionId: manifest.commit,
        branch: manifest.branch,
      }],
      results: resultsWithIndex,
    }],
  };

  return JSON.stringify(sarif, null, 2) + "\n";
}
