import { readFileContent } from "./utils.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { Manifest, DataCollectionPoint } from "./types.js";
import { SiteConfig } from "./config.js";

// Register helpers
Handlebars.registerHelper("eq", (a: string, b: string) => a === b);
Handlebars.registerHelper("hasGdpr", (jurisdictions: string[]) =>
  jurisdictions?.includes("gdpr") ?? false
);
Handlebars.registerHelper("hasCcpa", (jurisdictions: string[]) =>
  jurisdictions?.includes("ccpa") ?? false
);
Handlebars.registerHelper("joinFields", (fields: string[]) =>
  fields?.map(f => f.replace(/_/g, " ")).join(", ") ?? ""
);

// Auto-incrementing section counter for ToS
let sectionCounter = 0;
Handlebars.registerHelper("nextSection", () => ++sectionCounter);

function getSectionTitle(point: DataCollectionPoint): string {
  switch (point.type) {
    case "contact-info": return "Contact Information";
    case "user-input": return "User Input";
    case "api-input": return `API Data (${point.source})`;
    case "cookie": return "Cookie Data";
    case "tracking": return `Analytics (${point.processor})`;
    default: return point.type;
  }
}

function getSourceDescription(point: DataCollectionPoint): string {
  switch (point.source) {
    case "web-form": return `Web form at \`${point.location}\``;
    case "server-cookie": return `Server-side cookie set in \`${point.location}\``;
    case "client-cookie": return `Client-side cookie set in \`${point.location}\``;
    default:
      if (point.source.startsWith("POST")) return `${point.source} endpoint in \`${point.location}\``;
      return `${point.source} in \`${point.location}\``;
  }
}

function getLegalBasis(point: DataCollectionPoint): string {
  switch (point.type) {
    case "contact-info": return "Consent — you voluntarily submit this data (Art. 6(1)(a))";
    case "user-input": return "Consent — you voluntarily submit this data (Art. 6(1)(a))";
    case "api-input": return "Contract — necessary to provide the service you requested (Art. 6(1)(b))";
    case "cookie": return "Legitimate interest — necessary for application functionality (Art. 6(1)(f))";
    case "tracking": return "Legitimate interest — understanding site usage (Art. 6(1)(f))";
    default: return "Legitimate interest (Art. 6(1)(f))";
  }
}

function getRetentionDescription(point: DataCollectionPoint): string {
  switch (point.retention) {
    case "transient": return "Not stored — discarded after processing";
    case "persistent": return "Stored persistently on our servers";
    default: return "Retained as long as necessary for the stated purpose";
  }
}

function getTemplateDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "templates");
}

function formatScanDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function deduplicatePoints(points: DataCollectionPoint[]): DataCollectionPoint[] {
  const deduped: DataCollectionPoint[] = [];
  const seen = new Set<string>();
  for (const d of points) {
    const key = `${d.type}:${[...d.fields].sort().join(",")}`;
    if (seen.has(key)) {
      const existing = deduped.find(e => `${e.type}:${[...e.fields].sort().join(",")}` === key)!;
      existing.location += `, ${d.location}`;
    } else {
      seen.add(key);
      deduped.push({ ...d });
    }
  }
  return deduped;
}

export interface RenderContext {
  manifest: Manifest;
  config: SiteConfig;
}

export async function renderPrivacyPolicy(ctx: RenderContext): Promise<string> {
  const templatePath = join(getTemplateDir(), "privacy-policy.hbs");
  const templateSource = await readFileContent(templatePath);
  const template = Handlebars.compile(templateSource);

  // Separate data collection points by type for template
  const cookies = ctx.manifest.dataCollection.filter(d => d.type === "cookie");
  const tracking = ctx.manifest.dataCollection.filter(d => d.type === "tracking");
  const nonCookieNonTracking = ctx.manifest.dataCollection.filter(
    d => d.type !== "cookie" && d.type !== "tracking"
  );

  const deduped = deduplicatePoints(nonCookieNonTracking);

  // Enrich data collection points with display fields
  const enriched = deduped.map(d => ({
    ...d,
    sectionTitle: getSectionTitle(d),
    sourceDescription: getSourceDescription(d),
    legalBasis: getLegalBasis(d),
    retentionDescription: getRetentionDescription(d),
  }));

  const data = {
    config: ctx.config,
    scanDate: formatScanDate(ctx.manifest.scanDate),
    branch: ctx.manifest.branch,
    commit: ctx.manifest.commit,
    dataCollection: enriched.length > 0 ? enriched : null,
    thirdPartyServices: ctx.manifest.thirdPartyServices.length > 0
      ? ctx.manifest.thirdPartyServices
      : null,
    cookies: cookies.length > 0 ? cookies : null,
    hasFunctionalCookies: cookies.length > 0,
    tracking: tracking.length > 0 ? tracking : null,
  };

  return template(data);
}

export async function renderTermsOfService(ctx: RenderContext): Promise<string> {
  const templatePath = join(getTemplateDir(), "terms-of-service.hbs");
  const templateSource = await readFileContent(templatePath);
  const template = Handlebars.compile(templateSource);

  // Reset section counter — sections 1-3 are hardcoded, dynamic numbering starts at 4
  // (or 5 if cookies section is present)
  const hasCookies = ctx.manifest.dataCollection.some(d => d.type === "cookie");
  sectionCounter = hasCookies ? 4 : 3;

  // Detect if there's a game (game-related endpoints or files)
  const hasGame = ctx.manifest.dataCollection.some(
    d => d.location.includes("game") || d.source.includes("game")
  );

  // Determine what user input the site collects (deduplicated)
  const userInputPoints = deduplicatePoints(
    ctx.manifest.dataCollection.filter(
      d => d.type === "contact-info" || d.type === "user-input" || d.type === "api-input"
    )
  );
  const hasUserInput = userInputPoints.length > 0;

  // Build user input summary for ToS
  const userInputSummary = userInputPoints.map(d => ({
    feature: getSectionTitle(d),
    fields: d.fields.map(f => f.replace(/_/g, " ")).join(", "),
    method: d.source,
  }));

  // Build services description
  const services: string[] = [];
  if (ctx.manifest.dataCollection.some(d => d.type === "contact-info")) {
    services.push("A contact form for inquiries");
  }
  if (hasGame) {
    services.push("An interactive browser-based game");
  }
  if (ctx.manifest.dataCollection.some(d => d.source.includes("generate"))) {
    services.push("AI-powered content generation tools");
  }
  services.push("Portfolio and blog content");

  const data = {
    config: ctx.config,
    scanDate: formatScanDate(ctx.manifest.scanDate),
    branch: ctx.manifest.branch,
    commit: ctx.manifest.commit,
    services,
    hasUserInput,
    userInputSummary,
    hasCookies,
    hasGame,
    thirdPartyServices: ctx.manifest.thirdPartyServices.length > 0
      ? ctx.manifest.thirdPartyServices
      : null,
  };

  return template(data);
}

export async function renderVulnerabilityDisclosure(ctx: RenderContext): Promise<string> {
  const templatePath = join(getTemplateDir(), "vulnerability-disclosure.hbs");
  const templateSource = await readFileContent(templatePath);
  const template = Handlebars.compile(templateSource);

  // Build in-scope list from what we know about the site
  const inScope: string[] = [];
  const siteUrl = ctx.config.siteUrl.replace(/\/$/, "");
  if (siteUrl) {
    inScope.push(`The website at ${siteUrl} and all subpages`);
  }
  if (ctx.manifest.dataCollection.some(d => d.type === "contact-info")) {
    inScope.push("Contact form submission and processing");
  }
  if (ctx.manifest.dataCollection.some(d => d.location.includes("game"))) {
    inScope.push("Game application and its server-side components");
  }
  if (ctx.manifest.dataCollection.some(d => d.source.includes("POST"))) {
    inScope.push("API endpoints accepting user input");
  }
  if (ctx.manifest.securityHeaders) {
    inScope.push("HTTP security header configuration");
  }
  inScope.push("Authentication and session management");
  inScope.push("Data storage and transmission security");

  const data = {
    config: ctx.config,
    scanDate: formatScanDate(ctx.manifest.scanDate),
    branch: ctx.manifest.branch,
    commit: ctx.manifest.commit,
    inScope,
    thirdPartyServices: ctx.manifest.thirdPartyServices.length > 0
      ? ctx.manifest.thirdPartyServices
      : null,
  };

  return template(data);
}
