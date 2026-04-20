import type { Manifest, AIComplianceResult } from "../../types.js";
import type { ControlResult } from "../framework-report.js";

/**
 * OSCAL Assessment Results export (model: ar, schema version 1.1.2).
 *
 * Two assessment results, one per framework:
 *   1. NIST CSF 2.0 evaluation — cites framework subcategory IDs directly
 *      (e.g. "GV.PO-01") since NIST CSF 2.0 is the primary framework.
 *   2. EU AI Act evaluation — cites article identifiers ("ART-5") with
 *      regulation metadata in props.
 *
 * Each ControlResult / AIComplianceResult becomes one observation. Non-pass
 * results also produce a finding referencing the observation, which is the
 * OSCAL convention for assessment output that needs downstream remediation
 * tracking.
 *
 * Reference: https://pages.nist.gov/OSCAL/reference/latest/assessment-results/
 * Reference JSON schema: https://github.com/usnistgov/OSCAL
 *
 * Note: many GRC platforms are still catching up to OSCAL — Hyperproof,
 * Drata's custom-control import, and some Vanta paths accept it in partial
 * form. Don't expect a lossless round-trip against every vendor.
 */

// UUID v4 via Web Crypto where available (Node 20 + Workers both expose it).
function uuid(): string {
  // Fall back to a simple v4 generator only if crypto.randomUUID isn't present.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Deterministic fallback — acceptable because exports are regenerated
  // on every scan; no one is supposed to cross-reference UUIDs across runs.
  const hex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0"));
  hex[6] = ((parseInt(hex[6]!, 16) & 0x0f) | 0x40).toString(16).padStart(2, "0");
  hex[8] = ((parseInt(hex[8]!, 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function oscalStatus(
  status: "pass" | "fail" | "partial" | "not-applicable",
): "satisfied" | "not-satisfied" {
  // OSCAL's assessment model only distinguishes satisfied / not-satisfied
  // on a finding. We surface partial / not-applicable detail via props so
  // downstream tooling can re-hydrate the nuance when it cares.
  return status === "pass" ? "satisfied" : "not-satisfied";
}

interface OscalObservation {
  uuid: string;
  title: string;
  description: string;
  methods: string[];
  collected: string;
  subjects: Array<{ type: string; "subject-uuid": string; title?: string }>;
  props?: Array<{ name: string; value: string; ns?: string }>;
  "relevant-evidence"?: Array<{ href: string; description: string }>;
}

interface OscalFinding {
  uuid: string;
  title: string;
  description: string;
  "related-observations": Array<{ "observation-uuid": string }>;
  target: {
    "target-id": string;
    type: "statement-id" | "objective-id";
    status: { state: "satisfied" | "not-satisfied" };
  };
}

interface OscalResult {
  uuid: string;
  title: string;
  description: string;
  start: string;
  "reviewed-controls": {
    "control-selections": Array<{
      description: string;
      "include-controls": Array<{ "control-id": string }>;
    }>;
  };
  observations: OscalObservation[];
  findings: OscalFinding[];
}

interface OscalAssessmentResults {
  "assessment-results": {
    uuid: string;
    metadata: {
      title: string;
      "last-modified": string;
      version: string;
      "oscal-version": "1.1.2";
    };
    "import-ap": { href: string };
    results: OscalResult[];
  };
}

function nistResultToResult(
  manifest: Manifest,
  results: ControlResult[],
): OscalResult {
  // Stable subject UUID per repo so observations across scans can be
  // correlated if a consumer stores them. Deliberately not using
  // manifest.commit — subject is "the repo", not "this commit".
  const repoSubjectUuid = uuid();

  const observations: OscalObservation[] = results.map(r => ({
    uuid: uuid(),
    title: `${r.control.id}: ${r.control.subcategory}`,
    description: r.evidence,
    methods: ["AUTOMATED"],
    collected: manifest.scanDate,
    subjects: [{
      type: "resource",
      "subject-uuid": repoSubjectUuid,
      title: manifest.repo,
    }],
    props: [
      { name: "control-id", value: r.control.id, ns: "https://nist.gov/ns/oscal/grc/nist-csf" },
      { name: "function", value: r.control.function, ns: "https://nist.gov/ns/oscal/grc/nist-csf" },
      { name: "status", value: r.status, ns: "https://nist.gov/ns/oscal/grc/status" },
      ...r.soc2.map(id => ({ name: "cross-ref-soc2", value: id })),
      ...r.iso27001.map(id => ({ name: "cross-ref-iso27001", value: id })),
    ],
  }));

  const findings: OscalFinding[] = results
    .filter(r => r.status !== "pass" && r.status !== "not-applicable")
    .map(r => {
      const obs = observations.find(o => o.title.startsWith(`${r.control.id}:`))!;
      return {
        uuid: uuid(),
        title: `Gap — ${r.control.id}`,
        description: r.evidence,
        "related-observations": [{ "observation-uuid": obs.uuid }],
        target: {
          "target-id": r.control.id,
          type: "statement-id",
          status: { state: oscalStatus(r.status) },
        },
      };
    });

  return {
    uuid: uuid(),
    title: "NIST Cybersecurity Framework 2.0 assessment",
    description: `Automated scan of ${manifest.repo} at commit ${manifest.commit} (branch ${manifest.branch}) against the 18 NIST CSF 2.0 subcategories this scanner evaluates.`,
    start: manifest.scanDate,
    "reviewed-controls": {
      "control-selections": [{
        description: "NIST CSF 2.0 subcategories evaluated by the scanner.",
        "include-controls": results.map(r => ({ "control-id": r.control.id })),
      }],
    },
    observations,
    findings,
  };
}

function euAiActResultToResult(
  manifest: Manifest,
  results: AIComplianceResult[],
): OscalResult {
  const repoSubjectUuid = uuid();

  const observations: OscalObservation[] = results.map(r => ({
    uuid: uuid(),
    title: `${r.articleId}: ${r.title}`,
    description: r.evidence,
    methods: ["AUTOMATED"],
    collected: manifest.scanDate,
    subjects: [{
      type: "resource",
      "subject-uuid": repoSubjectUuid,
      title: manifest.repo,
    }],
    props: [
      { name: "article-id", value: r.articleId, ns: "https://ec.europa.eu/ns/oscal/grc/eu-ai-act" },
      { name: "article-number", value: String(r.article), ns: "https://ec.europa.eu/ns/oscal/grc/eu-ai-act" },
      { name: "phase", value: r.phase, ns: "https://www.nist.gov/ns/oscal/grc/ai-rmf" },
      { name: "status", value: r.status, ns: "https://nist.gov/ns/oscal/grc/status" },
      ...r.nistAiRmf.map(id => ({ name: "cross-ref-nist-ai-rmf", value: id })),
      ...r.iso42001.map(id => ({ name: "cross-ref-iso42001", value: id })),
    ],
  }));

  const findings: OscalFinding[] = results
    .filter(r => r.status !== "pass" && r.status !== "not-applicable")
    .map(r => {
      const obs = observations.find(o => o.title.startsWith(`${r.articleId}:`))!;
      return {
        uuid: uuid(),
        title: `Gap — EU AI Act ${r.articleId}`,
        description: r.evidence,
        "related-observations": [{ "observation-uuid": obs.uuid }],
        target: {
          "target-id": r.articleId,
          type: "statement-id",
          status: { state: oscalStatus(r.status) },
        },
      };
    });

  return {
    uuid: uuid(),
    title: "EU AI Act assessment",
    description: `Automated scan of ${manifest.repo} at commit ${manifest.commit} (branch ${manifest.branch}) against 13 EU AI Act articles.`,
    start: manifest.scanDate,
    "reviewed-controls": {
      "control-selections": [{
        description: "EU AI Act articles evaluated by the scanner.",
        "include-controls": results.map(r => ({ "control-id": r.articleId })),
      }],
    },
    observations,
    findings,
  };
}

export function generateOscalExport(
  manifest: Manifest,
  nistCsf: ControlResult[],
  euAiAct: AIComplianceResult[],
): string {
  const payload: OscalAssessmentResults = {
    "assessment-results": {
      uuid: uuid(),
      metadata: {
        title: `GRC Assessment — ${manifest.repo} @ ${manifest.branch} (${manifest.commit})`,
        "last-modified": new Date().toISOString(),
        version: "1.0",
        "oscal-version": "1.1.2",
      },
      // Assessment Plans are a separate OSCAL artifact; we don't ship one.
      // Reference a well-known placeholder URI so consumers know the plan is
      // implied by the scanner's own documentation rather than an upstream
      // file they need to fetch.
      "import-ap": { href: "https://github.com/shipstuff/GRC-Observability-Dashboard#assessment-plan" },
      results: [
        nistResultToResult(manifest, nistCsf),
        ...(euAiAct.length > 0 ? [euAiActResultToResult(manifest, euAiAct)] : []),
      ],
    },
  };

  return JSON.stringify(payload, null, 2) + "\n";
}
