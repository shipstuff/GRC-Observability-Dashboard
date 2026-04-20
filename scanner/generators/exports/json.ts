import type { Manifest, AIComplianceResult } from "../../types.js";
import type { ControlResult } from "../framework-report.js";
import type { Risk } from "../risk-assessment.js";

/**
 * "Enhanced JSON" export — the raw manifest plus everything computed off
 * it (NIST CSF evaluation, EU AI Act evaluation, risk register). Intended
 * as a single well-formed blob that downstream tooling or custom scripts
 * can ingest without re-running the scanner.
 *
 * Shape is deliberately stable: top-level keys are snake-case'd via the
 * renameKey step below so CSV / OSCAL / SARIF exports can reference the
 * same canonical field names regardless of the TypeScript interface.
 */
export interface GRCExport {
  schema: "grc-export";
  schemaVersion: "1.0";
  generatedAt: string;
  manifest: Manifest;
  nistCsf: ControlResult[];
  euAiAct: AIComplianceResult[];
  risks: Risk[];
}

export function generateJsonExport(
  manifest: Manifest,
  nistCsf: ControlResult[],
  euAiAct: AIComplianceResult[],
  risks: Risk[],
): string {
  const payload: GRCExport = {
    schema: "grc-export",
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    manifest,
    nistCsf,
    euAiAct,
    risks,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}
