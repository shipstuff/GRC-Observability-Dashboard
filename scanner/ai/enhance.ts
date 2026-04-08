import { Manifest, DataCollectionPoint } from "../types.js";
import { SiteConfig } from "../config.js";
import { AIClient, AIMessage } from "./provider.js";
import { Risk } from "../generators/risk-assessment.js";
import { ControlResult } from "../generators/framework-report.js";

export interface AIEnhancements {
  piiClassifications: PIIClassification[];
  riskNarratives: Map<string, string>;
  prSummary: string | null;
  gapAnalysis: string | null;
}

export interface PIIClassification {
  field: string;
  location: string;
  category: "directly-identifying" | "pseudonymous" | "sensitive" | "non-personal" | "unknown";
  gdprCategory: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

/**
 * Creates an AI client from config + environment.
 * Returns null if AI is disabled or no API key is available.
 */
export function createAIClient(config: SiteConfig): AIClient | null {
  if (!config.ai.enabled) return null;

  const keyEnvVars: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };

  const envVar = keyEnvVars[config.ai.provider];
  const apiKey = process.env[envVar];

  if (!apiKey) {
    console.warn(`   ⚠ AI enabled but ${envVar} not set — skipping AI enhancements`);
    return null;
  }

  return new AIClient(config.ai.provider, apiKey);
}

/**
 * Classify form fields as PII categories.
 */
export async function classifyPII(
  client: AIClient,
  dataCollection: DataCollectionPoint[]
): Promise<PIIClassification[]> {
  const fields = dataCollection.flatMap(d =>
    d.fields.map(f => ({ field: f, location: d.location, source: d.source }))
  );

  if (fields.length === 0) return [];

  const fieldList = fields.map(f => `- "${f.field}" (from ${f.source} at ${f.location})`).join("\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a data privacy expert. Classify form fields into PII categories for GDPR compliance.

For each field, respond with a JSON array of objects:
{
  "field": "field_name",
  "category": "directly-identifying" | "pseudonymous" | "sensitive" | "non-personal",
  "gdprCategory": "the GDPR Article 9 category if sensitive, or general category",
  "confidence": "high" | "medium" | "low",
  "reasoning": "one sentence explaining the classification"
}

Categories:
- directly-identifying: Can identify a person directly (name, email, phone, address, SSN)
- pseudonymous: Could identify with additional data (username, user ID, IP address, cookie ID)
- sensitive: Special category under GDPR Art. 9 (health, religion, political, biometric, sexual orientation)
- non-personal: Cannot identify a person even with additional data (game coordinates, item quantities, CSS prompts)

Respond ONLY with the JSON array, no other text.`,
    },
    {
      role: "user",
      content: `Classify these form fields:\n${fieldList}`,
    },
  ];

  const response = await client.chat(messages, 2048);

  try {
    const classifications = JSON.parse(response.content) as Array<{
      field: string;
      category: string;
      gdprCategory: string;
      confidence: string;
      reasoning: string;
    }>;

    return classifications.map(c => {
      const fieldInfo = fields.find(f => f.field === c.field);
      return {
        field: c.field,
        location: fieldInfo?.location ?? "unknown",
        category: c.category as PIIClassification["category"],
        gdprCategory: c.gdprCategory,
        confidence: c.confidence as PIIClassification["confidence"],
        reasoning: c.reasoning,
      };
    });
  } catch {
    console.warn("   ⚠ Could not parse PII classification response");
    return [];
  }
}

/**
 * Generate human-friendly risk narratives.
 */
export async function enhanceRiskNarratives(
  client: AIClient,
  risks: Risk[],
  config: SiteConfig
): Promise<Map<string, string>> {
  const narratives = new Map<string, string>();

  const riskSummary = risks.map(r =>
    `${r.id}: ${r.title} (${r.severity}) — ${r.description}`
  ).join("\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a GRC analyst writing risk narratives for a compliance report. The site is ${config.siteName} (${config.siteUrl}), a personal portfolio site.

For each risk, write a 2-3 sentence narrative that:
1. Explains the business impact in plain English (not just technical jargon)
2. Puts it in context — how likely is this to actually be exploited on a personal portfolio?
3. Prioritizes actionability — what's the one thing to do first?

Respond with a JSON object where keys are risk IDs and values are the narrative strings. No other text.`,
    },
    {
      role: "user",
      content: `Write narratives for these risks:\n${riskSummary}`,
    },
  ];

  const response = await client.chat(messages, 2048);

  try {
    const parsed = JSON.parse(response.content) as Record<string, string>;
    for (const [id, narrative] of Object.entries(parsed)) {
      narratives.set(id, narrative);
    }
  } catch {
    console.warn("   ⚠ Could not parse risk narrative response");
  }

  return narratives;
}

/**
 * Generate a plain-English PR summary of compliance changes.
 */
export async function generatePRSummary(
  client: AIClient,
  manifest: Manifest,
  risks: Risk[],
  frameworkResults: ControlResult[]
): Promise<string> {
  const applicable = frameworkResults.filter(r => r.status !== "not-applicable");
  const passed = applicable.filter(r => r.status === "pass").length;
  const overallPct = Math.round((passed / applicable.length) * 100);

  const critical = risks.filter(r => r.severity === "critical");
  const high = risks.filter(r => r.severity === "high");

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a GRC automation bot commenting on a pull request. Write a concise compliance summary.

Format your response as a GitHub-flavored markdown comment. Include:
1. Overall compliance score
2. Critical/high risks that need attention (if any)
3. What changed since the last scan (if obvious)
4. One actionable next step

Keep it under 200 words. Be direct, not bureaucratic.`,
    },
    {
      role: "user",
      content: `Scan results for ${manifest.repo} (branch: ${manifest.branch}):
- NIST CSF compliance: ${overallPct}%
- Data collection points: ${manifest.dataCollection.length}
- Third-party services: ${manifest.thirdPartyServices.map(s => s.name).join(", ")}
- Security headers: ${manifest.securityHeaders ? Object.values(manifest.securityHeaders).filter(v => v === "present").length + "/6" : "not checked"}
- Dependencies: ${manifest.dependencies ? `${manifest.dependencies.criticalVulnerabilities} critical, ${manifest.dependencies.highVulnerabilities} high vulns` : "not checked"}
- Critical risks: ${critical.map(r => r.title).join(", ") || "none"}
- High risks: ${high.map(r => r.title).join(", ") || "none"}
- Secrets detected: ${manifest.secretsScan.detected ? "YES" : "no"}`,
    },
  ];

  const response = await client.chat(messages, 512);
  return response.content;
}

/**
 * Analyze compliance gaps and suggest highest-impact improvements.
 */
export async function analyzeGaps(
  client: AIClient,
  frameworkResults: ControlResult[],
  risks: Risk[],
  config: SiteConfig
): Promise<string> {
  const failures = frameworkResults
    .filter(r => r.status === "fail" || r.status === "partial")
    .map(r => `${r.control.id} (${r.control.description}): ${r.status} — ${r.evidence}`)
    .join("\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are a GRC consultant analyzing a compliance gap analysis. The site is ${config.siteName}, a personal portfolio hosted on Digital Ocean.

Given the failing/partial controls, recommend the top 3 actions that would have the highest compliance impact. For each:
1. What to do (specific, actionable)
2. Which framework controls it would satisfy
3. Estimated effort (quick fix, moderate, significant)

Format as markdown. Be practical — this is a solo developer, not an enterprise.`,
    },
    {
      role: "user",
      content: `Failing/partial controls:\n${failures}\n\nOpen risks:\n${risks.map(r => `${r.id}: ${r.title} (${r.severity})`).join("\n")}`,
    },
  ];

  const response = await client.chat(messages, 1024);
  return response.content;
}

/**
 * Run all AI enhancements. Returns null if AI is not available.
 */
export async function runAIEnhancements(
  config: SiteConfig,
  manifest: Manifest,
  risks: Risk[],
  frameworkResults: ControlResult[]
): Promise<AIEnhancements | null> {
  const client = createAIClient(config);
  if (!client) return null;

  console.log("\n   Running AI enhancements...");

  const [piiClassifications, riskNarratives, prSummary, gapAnalysis] = await Promise.all([
    classifyPII(client, manifest.dataCollection)
      .then(r => { console.log(`   ✓ PII classification: ${r.length} fields classified`); return r; })
      .catch(e => { console.warn(`   ⚠ PII classification failed: ${e.message}`); return [] as PIIClassification[]; }),
    enhanceRiskNarratives(client, risks, config)
      .then(r => { console.log(`   ✓ Risk narratives: ${r.size} enhanced`); return r; })
      .catch(e => { console.warn(`   ⚠ Risk narratives failed: ${e.message}`); return new Map<string, string>(); }),
    generatePRSummary(client, manifest, risks, frameworkResults)
      .then(r => { console.log(`   ✓ PR summary: generated`); return r; })
      .catch(e => { console.warn(`   ⚠ PR summary failed: ${e.message}`); return null; }),
    analyzeGaps(client, frameworkResults, risks, config)
      .then(r => { console.log(`   ✓ Gap analysis: generated`); return r; })
      .catch(e => { console.warn(`   ⚠ Gap analysis failed: ${e.message}`); return null; }),
  ]);

  return { piiClassifications, riskNarratives, prSummary, gapAnalysis };
}
