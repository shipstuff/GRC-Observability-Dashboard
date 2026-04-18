import { AISystem, } from "../types.js";
import type { AISystemOverride } from "../config.js";

// EU AI Act Article 5 — prohibited practices. Path keywords that might signal
// subliminal manipulation, social scoring, or real-time biometric ID in public.
const PROHIBITED_KEYWORDS = [
  "social-score",
  "social-credit",
  "behavior-score",
  "subliminal",
  "manipulate-user",
  "exploit-vulnerability",
];

// EU AI Act Annex III — high-risk domains. These path keywords are strong signals
// the AI system is operating in employment, credit, healthcare, education, or
// biometric identification contexts.
const HIGH_RISK_KEYWORDS = [
  "hiring",
  "recruit",
  "resume-screen",
  "applicant-screen",
  "cv-screen",
  "credit-score",
  "loan-decision",
  "underwrite",
  "fraud-decision",
  "medical-dx",
  "diagnos",
  "clinical-decision",
  "patient-triage",
  "biometric-id",
  "facial-rec",
  "face-match",
  "exam-grade",
  "student-assess",
  "admission-decision",
];

// Path segments that usually indicate dev tooling, tests, or internal-only code
// rather than a user-facing AI feature. Matched as "/seg/" or at path start.
const LOW_SIGNAL_SEGMENTS = [
  "test",
  "tests",
  "spec",
  "__tests__",
  "examples",
  "scripts",
  "tools",
  "fixtures",
];

interface KeywordHit {
  path: string;
  keyword: string;
}

function collectPaths(s: AISystem): string[] {
  const paths = [s.location, ...(s.usageLocations ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function findKeyword(paths: string[], keywords: string[]): KeywordHit | null {
  for (const path of paths) {
    const lower = path.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) return { path, keyword: kw };
    }
  }
  return null;
}

function findPathSegment(paths: string[], segments: string[]): KeywordHit | null {
  for (const path of paths) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    const parts = lower.split("/");
    for (const seg of segments) {
      if (parts.includes(seg)) return { path, keyword: seg };
      if (lower.endsWith(`.${seg}.ts`) || lower.endsWith(`.${seg}.js`)) return { path, keyword: seg };
    }
  }
  return null;
}

// "Substantive usage" = a source path outside test/tooling directories. Only
// `usageLocations` counts (dependency-manifest paths like package.json do NOT
// count either way — they signal a declared dependency, not real use).
function hasSubstantiveUsage(usageLocations: string[] | undefined): boolean {
  if (!usageLocations || usageLocations.length === 0) return false;
  for (const path of usageLocations) {
    if (!findPathSegment([path], LOW_SIGNAL_SEGMENTS)) return true;
  }
  return false;
}

function classifyOne(s: AISystem): AISystem {
  const paths = collectPaths(s);

  const prohibited = findKeyword(paths, PROHIBITED_KEYWORDS);
  if (prohibited) {
    return {
      ...s,
      riskTier: "prohibited",
      riskTierSource: "heuristic",
      riskReasoning: `"${prohibited.path}" includes "${prohibited.keyword}" — potentially prohibited under EU AI Act Article 5. Verify intended use and override if misclassified.`,
    };
  }

  const highRisk = findKeyword(paths, HIGH_RISK_KEYWORDS);
  if (highRisk) {
    return {
      ...s,
      riskTier: "high",
      riskTierSource: "heuristic",
      riskReasoning: `"${highRisk.path}" includes "${highRisk.keyword}" — maps to EU AI Act Annex III high-risk domains. Requires FRIA, model card, and human oversight if deployed in the EU.`,
    };
  }

  const lowSignalHit = findPathSegment(s.usageLocations ?? [], LOW_SIGNAL_SEGMENTS);
  // Only downgrade when there is NO substantive usage path — a system used in
  // both tests and real source should still classify as "limited".
  const lowSignalOnly = lowSignalHit !== null && !hasSubstantiveUsage(s.usageLocations);

  switch (s.category) {
    case "training":
      return {
        ...s,
        riskTier: "limited",
        riskTierSource: "heuristic",
        riskReasoning: "ML training library detected. Final tier depends on the trained model's use case — override to 'high' if it's deployed in hiring, credit, healthcare, education, or biometric contexts.",
      };

    case "vector-db":
      return {
        ...s,
        riskTier: "minimal",
        riskTierSource: "heuristic",
        riskReasoning: "Vector store used for retrieval. Not itself a decision-maker; risk flows from the AI system that consumes it.",
      };

    case "self-hosted":
      return {
        ...s,
        riskTier: "minimal",
        riskTierSource: "heuristic",
        riskReasoning: "Self-hosted inference runtime. Tier depends on the model and use case — override to declare.",
      };

    case "framework":
    case "inference": {
      if (lowSignalOnly && lowSignalHit) {
        return {
          ...s,
          riskTier: "minimal",
          riskTierSource: "heuristic",
          riskReasoning: `Usage confined to "${lowSignalHit.keyword}" paths (e.g. "${lowSignalHit.path}") — likely dev tooling or internal use, not a user-facing AI feature.`,
        };
      }
      return {
        ...s,
        riskTier: "limited",
        riskTierSource: "heuristic",
        riskReasoning: "Assistant/generation usage. EU AI Act Article 50 transparency obligations likely apply. Upgrade to 'high' if used for employment, credit, healthcare, education, or biometric decisions.",
      };
    }
  }

  return {
    ...s,
    riskTier: "unknown",
    riskTierSource: "heuristic",
    riskReasoning: "Category did not match a known classification path.",
  };
}

export function classifyAISystems(systems: AISystem[]): AISystem[] {
  return systems.map(classifyOne);
}

export function applyAISystemOverrides(
  systems: AISystem[],
  overrides: AISystemOverride[],
  defaults: { euMarket: boolean } = { euMarket: false },
): AISystem[] {
  return systems.map(s => {
    const match = overrides.find(o =>
      o.location === s.location && (!o.name || o.name === s.sdk)
    );
    const euMarket = match?.euMarket ?? defaults.euMarket;
    const next: AISystem = { ...s, euMarket };

    if (match && match.riskTier) {
      const purposeClause = match.purpose ? ` Purpose: ${match.purpose}.` : "";
      const marketClause = match.euMarket === true ? " EU market: yes." : match.euMarket === false ? " EU market: no." : "";
      next.riskTier = match.riskTier;
      next.riskTierSource = "override";
      next.riskReasoning = `User override in .grc/config.yml.${purposeClause}${marketClause}`.trim();
    }
    return next;
  });
}
