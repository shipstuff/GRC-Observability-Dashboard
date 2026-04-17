import { AISystem, AIRiskTier } from "../types.js";
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

function matchKeyword(location: string, keywords: string[]): string | null {
  const lower = location.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function matchPathSegment(location: string, segments: string[]): string | null {
  const lower = location.toLowerCase().replace(/\\/g, "/");
  const parts = lower.split("/");
  for (const seg of segments) {
    if (parts.includes(seg)) return seg;
    if (lower.endsWith(`.${seg}.ts`) || lower.endsWith(`.${seg}.js`)) return seg;
  }
  return null;
}

function classifyOne(s: AISystem): AISystem {
  const prohibited = matchKeyword(s.location, PROHIBITED_KEYWORDS);
  if (prohibited) {
    return {
      ...s,
      riskTier: "prohibited",
      riskTierSource: "heuristic",
      riskReasoning: `Path includes "${prohibited}" — potentially prohibited under EU AI Act Article 5. Verify intended use and override if misclassified.`,
    };
  }

  const highRisk = matchKeyword(s.location, HIGH_RISK_KEYWORDS);
  if (highRisk) {
    return {
      ...s,
      riskTier: "high",
      riskTierSource: "heuristic",
      riskReasoning: `Path includes "${highRisk}" — maps to EU AI Act Annex III high-risk domains. Requires FRIA, model card, and human oversight if deployed in the EU.`,
    };
  }

  const lowSignal = matchPathSegment(s.location, LOW_SIGNAL_SEGMENTS);

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
      if (lowSignal) {
        return {
          ...s,
          riskTier: "minimal",
          riskTierSource: "heuristic",
          riskReasoning: `Located in "${lowSignal}" — likely dev tooling or internal use, not a user-facing AI feature.`,
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
  overrides: AISystemOverride[]
): AISystem[] {
  if (!overrides || overrides.length === 0) return systems;
  return systems.map(s => {
    const match = overrides.find(o =>
      o.location === s.location && (!o.name || o.name === s.sdk)
    );
    if (!match || !match.riskTier) return s;
    const purposeClause = match.purpose ? ` Purpose: ${match.purpose}.` : "";
    const marketClause = match.euMarket === true ? " EU market: yes." : match.euMarket === false ? " EU market: no." : "";
    return {
      ...s,
      riskTier: match.riskTier,
      riskTierSource: "override",
      riskReasoning: `User override in .grc/config.yml.${purposeClause}${marketClause}`.trim(),
    };
  });
}
