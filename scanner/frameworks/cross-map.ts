/**
 * Cross-mappings from NIST CSF 2.0 subcategories to:
 *
 *   - SOC 2 Trust Services Criteria, 2017 edition (revised 2022), published
 *     by the AICPA. Codes use the standard `CCx.y` format for the Common
 *     Criteria and `A1` / `C1` / `PI1` for Availability / Confidentiality /
 *     Processing Integrity where applicable.
 *
 *   - ISO/IEC 27001:2022 Annex A. This is the current standard (the 2013
 *     transition ended October 2025) with 93 controls organized into four
 *     themes: A.5 Organizational, A.6 People, A.7 Physical, A.8
 *     Technological. IDs use the two-component form (e.g. `A.5.23`,
 *     `A.8.9`) — the four-component form `A.X.Y.Z` from :2013 is obsolete.
 *
 * These mappings are illustrative — "this subcategory's intent is tracked
 * by these external controls" — not a formal equivalence declaration.
 */

export interface CrossMapping {
  csfId: string;
  soc2: string[];
  iso27001: string[];
}

export const CROSS_MAPPINGS: CrossMapping[] = [
  // GOVERN
  { csfId: "GV.PO-01", soc2: ["CC1.1", "CC1.2", "CC5.3"], iso27001: ["A.5.1"] },
  { csfId: "GV.SC-01", soc2: ["CC9.2"],                   iso27001: ["A.5.19", "A.5.20", "A.5.21", "A.5.22"] },

  // IDENTIFY
  { csfId: "ID.AM-01", soc2: ["CC6.1"],                   iso27001: ["A.5.9"] },
  { csfId: "ID.AM-02", soc2: ["CC6.1"],                   iso27001: ["A.5.9", "A.8.19"] },
  { csfId: "ID.RA-01", soc2: ["CC3.2", "CC7.1"],          iso27001: ["A.8.8"] },
  { csfId: "ID.RA-02", soc2: ["CC3.2"],                   iso27001: ["A.5.6"] },
  { csfId: "ID.RA-08", soc2: ["CC7.3"],                   iso27001: ["A.5.24", "A.6.8"] },
  { csfId: "ID.IM-02", soc2: ["CC4.1", "CC8.1"],          iso27001: ["A.8.8"] },

  // PROTECT
  { csfId: "PR.AA-01", soc2: ["CC6.1", "CC6.2"],          iso27001: ["A.5.16", "A.5.17"] },
  { csfId: "PR.AA-05", soc2: ["CC6.1", "CC6.3"],          iso27001: ["A.5.15", "A.8.3"] },
  { csfId: "PR.DS-01", soc2: ["CC6.1", "CC6.7"],          iso27001: ["A.5.10", "A.8.24"] },
  { csfId: "PR.DS-02", soc2: ["CC6.1", "CC6.7"],          iso27001: ["A.8.24", "A.8.20"] },
  { csfId: "PR.DS-10", soc2: ["CC6.1"],                   iso27001: ["A.8.20", "A.8.22", "A.8.23"] },
  { csfId: "PR.PS-01", soc2: ["CC7.1", "CC8.1"],          iso27001: ["A.8.9"] },

  // DETECT
  { csfId: "DE.CM-09", soc2: ["CC7.1"],                   iso27001: ["A.8.7", "A.8.16"] },

  // RESPOND
  { csfId: "RS.MA-01", soc2: ["CC7.3", "CC7.4"],          iso27001: ["A.5.24", "A.5.26"] },
  { csfId: "RS.CO-02", soc2: ["CC7.3"],                   iso27001: ["A.5.25", "A.6.8"] },

  // RECOVER
  { csfId: "RC.RP-01", soc2: ["CC7.5"],                   iso27001: ["A.5.29", "A.5.30"] },
];

export function getCrossMapping(csfId: string): CrossMapping | undefined {
  return CROSS_MAPPINGS.find(m => m.csfId === csfId);
}

/**
 * Cross-mapping from EU AI Act articles to:
 *
 *   - NIST AI Risk Management Framework (NIST AI 100-1, v1.0, January
 *     2023) subcategories. The AI RMF structures its 72 subcategories
 *     under four functions: GOVERN, MAP, MEASURE, MANAGE.
 *
 *   - ISO/IEC 42001:2023 Annex A — AI management system controls across
 *     10 objectives (A.2 through A.10).
 *
 * These are illustrative cross-references drawing on the NIST AI RMF
 * crosswalk publications and ISO/IEC 42001 alignment guidance. They are
 * not an authoritative regulatory mapping — EU AI Act obligations are
 * distinct legal requirements; AI RMF and 42001 provide complementary
 * governance programs that happen to cover overlapping concerns.
 */
export interface AICrossMapping {
  aiActId: string;
  nistAiRmf: string[];
  iso42001: string[];
}

export const AI_CROSS_MAPPINGS: AICrossMapping[] = [
  // GOVERN phase
  { aiActId: "ART-4",  nistAiRmf: ["GOVERN 2.2", "GOVERN 3.2"],             iso42001: ["A.3.2", "A.4.2"] },
  { aiActId: "ART-9",  nistAiRmf: ["GOVERN 1.4", "MAP 5.1", "MANAGE 1.3"],  iso42001: ["A.5.2", "A.5.4", "A.6.1.2"] },
  { aiActId: "ART-10", nistAiRmf: ["MAP 2.3", "MEASURE 2.2"],               iso42001: ["A.7.2", "A.7.3", "A.7.4"] },

  // MAP phase
  { aiActId: "ART-5",  nistAiRmf: ["GOVERN 1.1", "MAP 1.1"],                iso42001: ["A.5.3", "A.6.1.2"] },
  { aiActId: "ART-11", nistAiRmf: ["MAP 4.1", "MEASURE 1.3"],               iso42001: ["A.6.2.2", "A.6.2.3"] },

  // MEASURE phase
  { aiActId: "ART-12", nistAiRmf: ["MEASURE 2.8", "MANAGE 4.1"],            iso42001: ["A.6.2.8", "A.8.4"] },
  { aiActId: "ART-15", nistAiRmf: ["MEASURE 2.5", "MEASURE 2.7"],           iso42001: ["A.6.2.4", "A.8.2"] },
  { aiActId: "ART-27", nistAiRmf: ["MAP 5.2", "MEASURE 3.2"],               iso42001: ["A.5.5", "A.8.3"] },

  // MANAGE phase
  { aiActId: "ART-13", nistAiRmf: ["GOVERN 4.2", "MANAGE 3.1"],             iso42001: ["A.6.2.6", "A.8.1"] },
  { aiActId: "ART-14", nistAiRmf: ["MEASURE 2.6", "MANAGE 2.1"],            iso42001: ["A.6.2.7", "A.9.2"] },
  { aiActId: "ART-50", nistAiRmf: ["GOVERN 5.1", "MANAGE 3.2"],             iso42001: ["A.8.1", "A.9.3"] },
  // ART-71 is the actual EU AI Act article establishing the EU database
  // for high-risk AI systems listed in Annex III. The registration
  // obligations themselves are split across Article 49 (providers) and
  // Article 26(8) (deployers of certain public-sector systems).
  { aiActId: "ART-71", nistAiRmf: ["GOVERN 4.1"],                           iso42001: ["A.2.3"] },
  { aiActId: "ART-73", nistAiRmf: ["MANAGE 4.3"],                           iso42001: ["A.8.5", "A.10.3"] },
];

export function getAICrossMapping(aiActId: string): AICrossMapping | undefined {
  return AI_CROSS_MAPPINGS.find(m => m.aiActId === aiActId);
}
