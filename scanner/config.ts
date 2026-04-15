import { join } from "node:path";
import { readFileContent, fileExists } from "./utils.js";
import { parse } from "yaml";

export type AIProvider = "anthropic" | "openai";

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
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
  ai: { enabled: false, provider: "anthropic" },
};

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
    outputDir: raw.output_dir ?? DEFAULTS.outputDir,
    ai: {
      enabled: raw.ai?.enabled ?? DEFAULTS.ai.enabled,
      provider: raw.ai?.provider ?? DEFAULTS.ai.provider,
    },
  };
}
