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
