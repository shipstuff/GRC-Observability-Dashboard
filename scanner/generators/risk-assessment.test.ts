import { describe, expect, it } from "vitest";
import type { Manifest } from "../types.js";
import type { SiteConfig } from "../config.js";
import { assessRisks } from "./risk-assessment.js";

function manifestWithAI(aiOverrides: Partial<Manifest["aiSystems"][0]> = {}): Manifest {
  return {
    repo: "test/repo",
    scanDate: "2026-04-17T00:00:00Z",
    branch: "main",
    commit: "abc1234",
    dataCollection: [],
    thirdPartyServices: [],
    securityHeaders: null,
    https: null,
    dependencies: null,
    secretsScan: { detected: false, findings: [] },
    artifacts: {
      privacyPolicy: "generated",
      termsOfService: "generated",
      securityTxt: "present",
      vulnerabilityDisclosure: "present",
      incidentResponsePlan: "present",
    },
    accessControls: { branchProtection: true, requiredReviews: 1, signedCommits: false },
    aiSystems: [
      {
        provider: "OpenAI",
        sdk: "openai",
        location: "package.json",
        category: "inference",
        dataFlows: [],
        riskTier: "limited",
        riskTierSource: "heuristic",
        euMarket: false,
        ...aiOverrides,
      },
    ],
  };
}

function baseConfig(): SiteConfig {
  return {
    siteName: "Test Site",
    siteUrl: "https://example.com",
    ownerName: "Test",
    contactEmail: "test@example.com",
    securityContact: "test@example.com",
    logRetentionDays: 90,
    jurisdiction: ["gdpr"],
    preferredLanguages: ["en"],
    outputDir: "docs/policies",
    policyUrls: {},
    ai: { enabled: false, provider: "anthropic" },
    aiSystemOverrides: [],
  };
}

describe("assessRisks — AI compliance risks", () => {
  it("emits one ai-compliance Risk per failing/partial EU AI Act article", () => {
    const risks = assessRisks(manifestWithAI(), baseConfig(), []);
    const aiRisks = risks.filter(r => r.category === "ai-compliance");
    // At minimum, Article 4 (partial) and Article 50 (partial since no aiUsagePolicy artifact)
    expect(aiRisks.length).toBeGreaterThan(0);
    expect(aiRisks.every(r => r.category === "ai-compliance")).toBe(true);
  });

  it("rates a prohibited Article 5 failure as critical severity", () => {
    const risks = assessRisks(
      manifestWithAI({ riskTier: "prohibited", location: "src/social-score/rank.ts" }),
      baseConfig(),
      [],
    );
    const art5 = risks.find(r => r.title.includes("ART-5"));
    expect(art5).toBeDefined();
    expect(art5?.severity).toBe("critical");
    expect(art5?.likelihood).toBe("high");
    expect(art5?.impact).toBe("high");
  });

  it("rates failed high-risk articles as high severity", () => {
    const risks = assessRisks(
      manifestWithAI({ riskTier: "high" }),
      baseConfig(),
      [],
    );
    // ART-11 (technical documentation) fails without model cards and a high-risk system is present
    const art11 = risks.find(r => r.title.includes("ART-11"));
    expect(art11).toBeDefined();
    expect(art11?.likelihood).toBe("high");
    expect(art11?.impact).toBe("high");
  });

  it("rates partial articles on minimal-tier systems as low severity", () => {
    // A manifest with no AI systems at all: Article 4/5/etc. are either
    // not-applicable or pass. Compare to one with a limited-tier system
    // where Article 4 becomes partial.
    const risks = assessRisks(manifestWithAI({ riskTier: "limited" }), baseConfig(), []);
    const art4 = risks.find(r => r.title.includes("ART-4"));
    expect(art4).toBeDefined();
    expect(art4?.severity).toBe("low");
    expect(art4?.likelihood).toBe("low");
  });

  it("does not emit ai-compliance risks for not-applicable articles", () => {
    // No AI systems → most articles are N/A. Only Article 5 (always-applicable)
    // and never-N/A articles should produce risks at most.
    const noAIManifest = manifestWithAI();
    noAIManifest.aiSystems = [];
    const risks = assessRisks(noAIManifest, baseConfig(), []);
    const aiRisks = risks.filter(r => r.category === "ai-compliance");
    // Zero: Article 5 passes (no prohibited system), no others apply.
    expect(aiRisks.length).toBe(0);
  });

  it("populates framework cross-references for each AI risk", () => {
    const risks = assessRisks(manifestWithAI({ riskTier: "high", euMarket: true }), baseConfig(), []);
    const aiRisks = risks.filter(r => r.category === "ai-compliance");
    expect(aiRisks.length).toBeGreaterThan(0);
    for (const r of aiRisks) {
      expect(r.framework.some(f => f.startsWith("EU AI Act"))).toBe(true);
    }
  });
});
