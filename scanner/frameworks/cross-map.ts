/**
 * Cross-mapping from NIST CSF controls to SOC 2 and ISO 27001.
 * Each NIST CSF control maps to equivalent controls in other frameworks.
 */

export interface CrossMapping {
  nistId: string;
  soc2: string[];
  iso27001: string[];
}

export const CROSS_MAPPINGS: CrossMapping[] = [
  // IDENTIFY
  { nistId: "ID.AM-1", soc2: ["CC6.1"], iso27001: ["A.8.1.1"] },
  { nistId: "ID.AM-2", soc2: ["CC6.1"], iso27001: ["A.8.1.1", "A.12.5.1"] },
  { nistId: "ID.GV-1", soc2: ["CC1.1", "CC1.2"], iso27001: ["A.5.1.1", "A.5.1.2"] },
  { nistId: "ID.RA-1", soc2: ["CC3.2", "CC7.1"], iso27001: ["A.12.6.1"] },
  { nistId: "ID.RA-2", soc2: ["CC3.2"], iso27001: ["A.6.1.4"] },

  // PROTECT
  { nistId: "PR.AC-1", soc2: ["CC6.1", "CC6.2"], iso27001: ["A.9.2.1", "A.9.4.3"] },
  { nistId: "PR.AC-4", soc2: ["CC6.1", "CC6.3"], iso27001: ["A.9.1.2", "A.9.4.1"] },
  { nistId: "PR.DS-1", soc2: ["CC6.1", "CC6.7"], iso27001: ["A.8.2.3", "A.10.1.1"] },
  { nistId: "PR.DS-2", soc2: ["CC6.1", "CC6.7"], iso27001: ["A.10.1.1", "A.13.1.1"] },
  { nistId: "PR.DS-5", soc2: ["CC6.1"], iso27001: ["A.13.1.1", "A.13.1.3"] },
  { nistId: "PR.IP-1", soc2: ["CC7.1", "CC8.1"], iso27001: ["A.12.1.2", "A.14.2.2"] },
  { nistId: "PR.IP-12", soc2: ["CC7.1"], iso27001: ["A.12.6.1"] },

  // DETECT
  { nistId: "DE.CM-4", soc2: ["CC7.1"], iso27001: ["A.12.2.1"] },
  { nistId: "DE.CM-8", soc2: ["CC7.1"], iso27001: ["A.12.6.1"] },

  // RESPOND
  { nistId: "RS.RP-1", soc2: ["CC7.3", "CC7.4"], iso27001: ["A.16.1.1", "A.16.1.5"] },
  { nistId: "RS.CO-2", soc2: ["CC7.3"], iso27001: ["A.16.1.2"] },

  // RECOVER
  { nistId: "RC.RP-1", soc2: ["CC7.5"], iso27001: ["A.17.1.1"] },
  { nistId: "RC.IM-1", soc2: ["CC7.5"], iso27001: ["A.16.1.6"] },
];

export function getCrossMapping(nistId: string): CrossMapping | undefined {
  return CROSS_MAPPINGS.find(m => m.nistId === nistId);
}

/**
 * Cross-mapping from EU AI Act articles to NIST AI RMF (AI 100-1)
 * subcategories and ISO/IEC 42001:2023 Annex A controls. Mappings are
 * drawn from the published crosswalks maintained by NIST and ISO — they
 * are illustrative ("this article's intent is tracked by these external
 * controls"), not a formal equivalence.
 */
export interface AICrossMapping {
  aiActId: string;
  nistAiRmf: string[];
  iso42001: string[];
}

export const AI_CROSS_MAPPINGS: AICrossMapping[] = [
  // GOVERN
  { aiActId: "ART-4",  nistAiRmf: ["GOVERN 2.2", "GOVERN 3.2"], iso42001: ["A.3.2", "A.4.2"] },
  { aiActId: "ART-9",  nistAiRmf: ["GOVERN 1.4", "MAP 5.1", "MANAGE 1.3"], iso42001: ["A.5.2", "A.5.4", "A.6.1.2"] },
  { aiActId: "ART-10", nistAiRmf: ["MAP 2.3", "MEASURE 2.2"], iso42001: ["A.7.2", "A.7.3", "A.7.4"] },

  // MAP
  { aiActId: "ART-5",  nistAiRmf: ["GOVERN 1.1", "MAP 1.1"],            iso42001: ["A.5.3", "A.6.1.2"] },
  { aiActId: "ART-11", nistAiRmf: ["MAP 4.1", "MEASURE 1.3"],           iso42001: ["A.6.2.2", "A.6.2.3"] },

  // MEASURE
  { aiActId: "ART-12", nistAiRmf: ["MEASURE 2.8", "MANAGE 4.1"],        iso42001: ["A.6.2.8", "A.8.4"] },
  { aiActId: "ART-15", nistAiRmf: ["MEASURE 2.5", "MEASURE 2.7"],       iso42001: ["A.6.2.4", "A.8.2"] },
  { aiActId: "ART-27", nistAiRmf: ["MAP 5.2", "MEASURE 3.2"],           iso42001: ["A.5.5", "A.8.3"] },

  // MANAGE
  { aiActId: "ART-13", nistAiRmf: ["GOVERN 4.2", "MANAGE 3.1"],         iso42001: ["A.6.2.6", "A.8.1"] },
  { aiActId: "ART-14", nistAiRmf: ["MEASURE 2.6", "MANAGE 2.1"],        iso42001: ["A.6.2.7", "A.9.2"] },
  { aiActId: "ART-50", nistAiRmf: ["GOVERN 5.1", "MANAGE 3.2"],         iso42001: ["A.8.1", "A.9.3"] },
  { aiActId: "ART-60", nistAiRmf: ["GOVERN 4.1"],                       iso42001: ["A.2.3"] },
  { aiActId: "ART-73", nistAiRmf: ["MANAGE 4.3"],                       iso42001: ["A.8.5", "A.10.3"] },
];

export function getAICrossMapping(aiActId: string): AICrossMapping | undefined {
  return AI_CROSS_MAPPINGS.find(m => m.aiActId === aiActId);
}
