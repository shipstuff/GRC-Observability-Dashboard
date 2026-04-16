import { join, isAbsolute, normalize } from "node:path";
import { readFileContent, fileExists } from "./utils.js";
import { parse } from "yaml";

/**
 * Validates output_dir config value. Must be a non-empty relative path
 * that stays inside the repo. Falls back to default with a warning if invalid.
 */
function sanitizeOutputDir(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const trimmed = value.trim();
  if (isAbsolute(trimmed)) {
    console.warn(`   ⚠ output_dir "${trimmed}" is absolute — falling back to "${fallback}"`);
    return fallback;
  }
  const normalized = normalize(trimmed);
  if (normalized.startsWith("..") || normalized.includes(`..${"/"}`) || normalized.includes(`..${"\\"}`)) {
    console.warn(`   ⚠ output_dir "${trimmed}" escapes the repo — falling back to "${fallback}"`);
    return fallback;
  }
  return normalized;
}

export type AIProvider = "anthropic" | "openai";

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
}

/**
 * URLs (paths or full URLs) at which the user is serving each generated
 * policy on their live site. Entirely optional — if unset, Check Production
 * skips verification of that policy and reports "not configured" instead
 * of a failure. This keeps the tool framework-agnostic: users pick whatever
 * URL scheme their site uses (Express routes, Next.js pages, Hugo permalinks,
 * /legal/* paths, etc.) and opt in per policy.
 */
export interface PolicyUrls {
  privacyPolicy?: string;
  termsOfService?: string;
  vulnerabilityDisclosure?: string;
  incidentResponsePlan?: string;
  securityTxt?: string;
}

export interface SiteConfig {
  siteName: string;
  siteUrl: string;
  ownerName: string;
  contactEmail: string;
  securityContact: string;
  logRetentionDays: number;
  jurisdiction: string[];
  preferredLanguages: string[];
  outputDir: string;
  policyUrls: PolicyUrls;
  ai: AIConfig;
}

const DEFAULTS: SiteConfig = {
  siteName: "Unknown Site",
  siteUrl: "",
  ownerName: "Unknown",
  contactEmail: "",
  securityContact: "",
  logRetentionDays: 90,
  jurisdiction: ["gdpr", "ccpa"],
  preferredLanguages: ["en"],
  outputDir: "docs/policies",
  policyUrls: {},
  ai: { enabled: false, provider: "anthropic" },
};

function sanitizePolicyUrls(raw: any): PolicyUrls {
  if (!raw || typeof raw !== "object") return {};
  const out: PolicyUrls = {};
  const mapping: Array<[keyof PolicyUrls, string]> = [
    ["privacyPolicy", "privacy_policy"],
    ["termsOfService", "terms_of_service"],
    ["vulnerabilityDisclosure", "vulnerability_disclosure"],
    ["incidentResponsePlan", "incident_response_plan"],
    ["securityTxt", "security_txt"],
  ];
  for (const [outKey, inKey] of mapping) {
    const value = raw[inKey];
    if (typeof value === "string" && value.trim().length > 0) {
      out[outKey] = value.trim();
    }
  }
  return out;
}

export async function loadConfig(repoPath: string): Promise<SiteConfig> {
  const configPath = join(repoPath, ".grc", "config.yml");

  if (!(await fileExists(configPath))) {
    console.warn(`   ⚠ No .grc/config.yml found — using defaults. Create one for accurate policies.`);
    return DEFAULTS;
  }

  const content = await readFileContent(configPath);
  const raw = parse(content);

  return {
    siteName: raw.site_name ?? DEFAULTS.siteName,
    siteUrl: raw.site_url ?? DEFAULTS.siteUrl,
    ownerName: raw.owner_name ?? DEFAULTS.ownerName,
    contactEmail: raw.contact_email ?? DEFAULTS.contactEmail,
    securityContact: raw.security_contact ?? raw.contact_email ?? DEFAULTS.securityContact,
    logRetentionDays: raw.log_retention_days ?? DEFAULTS.logRetentionDays,
    jurisdiction: raw.jurisdiction ?? DEFAULTS.jurisdiction,
    preferredLanguages: raw.preferred_languages ?? DEFAULTS.preferredLanguages,
    outputDir: sanitizeOutputDir(raw.output_dir, DEFAULTS.outputDir),
    policyUrls: sanitizePolicyUrls(raw.policy_urls),
    ai: {
      enabled: raw.ai?.enabled ?? DEFAULTS.ai.enabled,
      provider: raw.ai?.provider ?? DEFAULTS.ai.provider,
    },
  };
}
