import { describe, expect, it } from "vitest";
import type { Manifest, AIComplianceResult } from "../../types.js";
import type { ControlResult } from "../framework-report.js";
import type { Risk } from "../risk-assessment.js";
import { generateJsonExport } from "./json.js";
import { generateCsvNistCsf, generateCsvRisks, generateCsvVulnerabilities } from "./csv.js";
import { generateSarifExport } from "./sarif.js";
import { generateOscalExport } from "./oscal.js";

function baseManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    repo: "test/repo",
    scanDate: "2026-04-19T00:00:00Z",
    branch: "main",
    commit: "abc1234",
    dataCollection: [],
    thirdPartyServices: [],
    securityHeaders: null,
    https: null,
    dependencies: null,
    secretsScan: { detected: false, findings: [] },
    artifacts: {
      privacyPolicy: "generated",
      termsOfService: "generated",
      securityTxt: "present",
      vulnerabilityDisclosure: "present",
      incidentResponsePlan: "present",
    },
    accessControls: { branchProtection: true, requiredReviews: 1, signedCommits: false },
    aiSystems: [],
    ...overrides,
  };
}

const emptyNist: ControlResult[] = [];
const emptyEu: AIComplianceResult[] = [];
const emptyRisks: Risk[] = [];

describe("JSON export", () => {
  it("produces a well-formed GRCExport envelope with schema + schemaVersion", () => {
    const out = generateJsonExport(baseManifest(), emptyNist, emptyEu, emptyRisks);
    const parsed = JSON.parse(out);
    expect(parsed.schema).toBe("grc-export");
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.manifest.repo).toBe("test/repo");
    expect(parsed.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(parsed.nistCsf)).toBe(true);
    expect(Array.isArray(parsed.euAiAct)).toBe(true);
    expect(Array.isArray(parsed.risks)).toBe(true);
  });
});

describe("CSV exports", () => {
  it("quotes fields containing commas, quotes, and newlines", () => {
    // Use a risk whose description contains each hazard character.
    const risks: Risk[] = [{
      id: "R1",
      category: "governance",
      title: 'Policy "thing"',
      description: "Line one,\nline two",
      likelihood: "low",
      impact: "low",
      severity: "low",
      status: "open",
      mitigation: "fix it",
      framework: [],
    }];
    const out = generateCsvRisks(baseManifest(), risks);
    const header = out.split("\n")[0];
    expect(header).toContain("repo");
    expect(header).toContain("title");
    // The title column must be double-quoted and contain escaped inner quotes.
    expect(out).toContain('"Policy ""thing"""');
    // Description with a newline and comma must also be quoted.
    expect(out).toContain('"Line one,\nline two"');
  });

  it("emits one row per control + a header", () => {
    const nist: ControlResult[] = [
      {
        control: { id: "ID.GV-1", function: "Identify", category: "Governance", subcategory: "x", description: "y", check: () => "pass", evidence: () => "" },
        status: "pass", evidence: "ok", soc2: ["CC1.1"], iso27001: ["A.5"],
      },
    ];
    const out = generateCsvNistCsf(baseManifest(), nist);
    const lines = out.trim().split("\n");
    expect(lines.length).toBe(2); // header + 1 row
    expect(lines[1]).toContain("ID.GV-1");
    expect(lines[1]).toContain("CC1.1");
  });

  it("gracefully handles a manifest missing the optional vulnerabilities field", () => {
    // Important for pre-Phase-9 manifests in KV.
    const out = generateCsvVulnerabilities(baseManifest());
    const lines = out.trim().split("\n");
    expect(lines.length).toBe(1); // header only
  });
});

describe("SARIF export", () => {
  it("produces a valid SARIF envelope with $schema and version", () => {
    const out = generateSarifExport(baseManifest());
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.$schema).toContain("sarif-schema-2.1.0");
    expect(Array.isArray(parsed.runs)).toBe(true);
    expect(parsed.runs.length).toBe(1);
    expect(parsed.runs[0].tool.driver.name).toBe("grc-observability-dashboard");
  });

  it("emits a dependency-vulnerability result per CVE with SARIF level mapped from severity", () => {
    const manifest = baseManifest({
      vulnerabilities: [
        { package: "lodash", advisoryId: "1", severity: "critical", title: "RCE", range: "<4.0", url: "https://x", cvssScore: 9.8, isDirect: true, fixAvailable: true, paths: [] },
        { package: "qs", advisoryId: "2", severity: "moderate", title: "ReDoS", range: "<1.0", url: "https://y", cvssScore: 5.1, isDirect: false, fixAvailable: false, paths: [] },
      ],
    });
    const parsed = JSON.parse(generateSarifExport(manifest));
    const results = parsed.runs[0].results;
    expect(results.length).toBe(2);
    expect(results[0].ruleId).toBe("grc/dependency-vulnerability");
    expect(results[0].level).toBe("error");   // critical → error
    expect(results[1].level).toBe("warning"); // moderate → warning
  });

  it("emits ai-prohibited and ai-high-risk results when systems match", () => {
    const manifest = baseManifest({
      aiSystems: [
        { provider: "OpenAI", sdk: "openai", location: "package.json", category: "inference", dataFlows: [], riskTier: "high", riskTierSource: "heuristic", usageLocations: ["src/hiring/screen.ts"], euMarket: true },
        { provider: "OpenAI", sdk: "openai", location: "package.json", category: "inference", dataFlows: [], riskTier: "prohibited", riskTierSource: "heuristic", usageLocations: ["src/social-score/rank.ts"], euMarket: true },
      ],
    });
    const parsed = JSON.parse(generateSarifExport(manifest));
    const ruleIds = parsed.runs[0].results.map((r: { ruleId: string }) => r.ruleId);
    expect(ruleIds).toContain("grc/ai-high-risk");
    expect(ruleIds).toContain("grc/ai-prohibited");
  });

  it("only emits rules that actually produced results (keeps output focused)", () => {
    const parsed = JSON.parse(generateSarifExport(baseManifest()));
    expect(parsed.runs[0].tool.driver.rules).toEqual([]);
    expect(parsed.runs[0].results).toEqual([]);
  });

  it("extracts the file path from the scanner's prose secret finding (regression: PR #32 Codex P1)", () => {
    const manifest = baseManifest({
      secretsScan: {
        detected: true,
        findings: [
          "OpenAI API key found in src/config.ts",
          "AWS access key found in lib/creds.ts:42",
        ],
      },
    });
    const parsed = JSON.parse(generateSarifExport(manifest));
    const results = parsed.runs[0].results;
    expect(results.length).toBe(2);
    // The URI must be just the path, not the prose label.
    expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("src/config.ts");
    expect(results[0].message.text).toContain("OpenAI API key");
    expect(results[0].message.text).not.toContain("found in");

    expect(results[1].locations[0].physicalLocation.artifactLocation.uri).toBe("lib/creds.ts");
    expect(results[1].locations[0].physicalLocation.region.startLine).toBe(42);
  });
});

describe("OSCAL export", () => {
  it("produces a valid assessment-results envelope with OSCAL 1.1.2", () => {
    const out = generateOscalExport(baseManifest(), emptyNist, emptyEu);
    const parsed = JSON.parse(out);
    const ar = parsed["assessment-results"];
    expect(ar.metadata["oscal-version"]).toBe("1.1.2");
    expect(ar.metadata.title).toContain("test/repo");
    expect(ar.metadata.title).toContain("main");
    expect(typeof ar.uuid).toBe("string");
    // UUID v4 pattern, not strict but should match the generic shape.
    expect(ar.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("emits one OSCAL result per framework — NIST always, EU AI Act only when results present", () => {
    const nistResults: ControlResult[] = [
      { control: { id: "ID.GV-1", function: "Identify", category: "Governance", subcategory: "x", description: "y", check: () => "pass", evidence: () => "" }, status: "pass", evidence: "ok", soc2: [], iso27001: [] },
    ];

    // No EU AI Act results → only one OSCAL result in the output.
    const outNoAi = JSON.parse(generateOscalExport(baseManifest(), nistResults, []));
    expect(outNoAi["assessment-results"].results.length).toBe(1);

    // With EU AI Act results → two results.
    const euResults: AIComplianceResult[] = [
      { articleId: "ART-5", article: 5, title: "Prohibited", phase: "Map", description: "", status: "pass", evidence: "ok", nistAiRmf: [], iso42001: [] },
    ];
    const outWithAi = JSON.parse(generateOscalExport(baseManifest(), nistResults, euResults));
    expect(outWithAi["assessment-results"].results.length).toBe(2);
  });

  it("emits one finding per non-pass non-applicable observation", () => {
    const nistResults: ControlResult[] = [
      { control: { id: "A", function: "Identify", category: "", subcategory: "", description: "", check: () => "pass", evidence: () => "" }, status: "pass", evidence: "", soc2: [], iso27001: [] },
      { control: { id: "B", function: "Protect", category: "", subcategory: "", description: "", check: () => "fail", evidence: () => "" }, status: "fail", evidence: "", soc2: [], iso27001: [] },
      { control: { id: "C", function: "Detect", category: "", subcategory: "", description: "", check: () => "partial", evidence: () => "" }, status: "partial", evidence: "", soc2: [], iso27001: [] },
      { control: { id: "D", function: "Respond", category: "", subcategory: "", description: "", check: () => "not-applicable", evidence: () => "" }, status: "not-applicable", evidence: "", soc2: [], iso27001: [] },
    ];
    const out = JSON.parse(generateOscalExport(baseManifest(), nistResults, []));
    const result = out["assessment-results"].results[0];
    expect(result.observations.length).toBe(4); // one per control
    expect(result.findings.length).toBe(2);      // fail + partial only
  });
});
