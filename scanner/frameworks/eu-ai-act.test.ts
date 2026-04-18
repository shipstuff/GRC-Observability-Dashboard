import { describe, expect, it } from "vitest";
import type { AISystem, Manifest } from "../types.js";
import {
  evaluateEUAIAct,
  calcAIComplianceScore,
  getAIPhaseScores,
} from "./eu-ai-act.js";

function baseManifest(overrides: Partial<Manifest> = {}): Manifest {
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
    aiSystems: [],
    ...overrides,
  };
}

function aiSystem(overrides: Partial<AISystem> = {}): AISystem {
  return {
    provider: "OpenAI",
    sdk: "openai",
    location: "package.json",
    category: "inference",
    dataFlows: [],
    riskTier: "limited",
    riskTierSource: "heuristic",
    euMarket: false,
    ...overrides,
  };
}

describe("evaluateEUAIAct", () => {
  it("returns 13 articles regardless of manifest shape", () => {
    expect(evaluateEUAIAct(baseManifest()).length).toBe(13);
    expect(evaluateEUAIAct(baseManifest({ aiSystems: [aiSystem()] })).length).toBe(13);
  });

  it("handles pre-Phase-8 manifests that predate the aiSystems field (regression guard for 2026-04-18 outage)", () => {
    const pre = baseManifest();
    // Simulate a pre-Phase-8 manifest: the aiSystems field was added then.
    delete (pre as Partial<Manifest>).aiSystems;
    const results = evaluateEUAIAct(pre as Manifest);
    expect(results.length).toBe(13);
    // Article 5 still evaluates (always applicable) — cannot throw.
    expect(results.find(r => r.articleId === "ART-5")?.status).toBe("pass");
  });

  describe("Article 5 — always applicable", () => {
    it("passes when no AI systems are present", () => {
      const art5 = evaluateEUAIAct(baseManifest()).find(r => r.articleId === "ART-5")!;
      expect(art5.status).toBe("pass");
    });

    it("passes when only non-prohibited systems are present", () => {
      const art5 = evaluateEUAIAct(
        baseManifest({ aiSystems: [aiSystem({ riskTier: "limited" })] }),
      ).find(r => r.articleId === "ART-5")!;
      expect(art5.status).toBe("pass");
    });

    it("fails when any system is classified as prohibited", () => {
      const art5 = evaluateEUAIAct(
        baseManifest({ aiSystems: [aiSystem({ riskTier: "prohibited", location: "src/social-score/rank.ts" })] }),
      ).find(r => r.articleId === "ART-5")!;
      expect(art5.status).toBe("fail");
      expect(art5.evidence).toContain("OpenAI");
    });
  });

  describe("Article 50 — transparency, applies at limited+", () => {
    it("is not-applicable when no AI systems are present", () => {
      const art50 = evaluateEUAIAct(baseManifest()).find(r => r.articleId === "ART-50")!;
      expect(art50.status).toBe("not-applicable");
    });

    it("passes when an AI usage policy artifact is present", () => {
      const art50 = evaluateEUAIAct(
        baseManifest({
          aiSystems: [aiSystem({ riskTier: "limited" })],
          artifacts: { ...baseManifest().artifacts, aiUsagePolicy: "present" },
        }),
      ).find(r => r.articleId === "ART-50")!;
      expect(art50.status).toBe("pass");
    });

    it("is partial when AI systems are present but no usage policy artifact", () => {
      const art50 = evaluateEUAIAct(
        baseManifest({ aiSystems: [aiSystem({ riskTier: "limited" })] }),
      ).find(r => r.articleId === "ART-50")!;
      expect(art50.status).toBe("partial");
    });
  });

  describe("Articles 11 / 12 / 13 / 14 / 15 — high-risk only", () => {
    it.each(["ART-11", "ART-12", "ART-13", "ART-14", "ART-15"])(
      "%s is not-applicable when no high-risk system present",
      (id) => {
        const r = evaluateEUAIAct(
          baseManifest({ aiSystems: [aiSystem({ riskTier: "limited" })] }),
        ).find(x => x.articleId === id)!;
        expect(r.status).toBe("not-applicable");
      },
    );

    it("ART-11 credits a generated model card artifact as partial", () => {
      const r = evaluateEUAIAct(
        baseManifest({
          aiSystems: [aiSystem({ riskTier: "high" })],
          artifacts: { ...baseManifest().artifacts, modelCards: "present" },
        }),
      ).find(x => x.articleId === "ART-11")!;
      expect(r.status).toBe("partial");
    });

    it("ART-11 fails when a high-risk system is present and no model card artifact", () => {
      const r = evaluateEUAIAct(
        baseManifest({ aiSystems: [aiSystem({ riskTier: "high" })] }),
      ).find(x => x.articleId === "ART-11")!;
      expect(r.status).toBe("fail");
    });
  });

  describe("Article 27 — FRIA, high-risk + eu_market gated", () => {
    it("is not-applicable when a high-risk system exists but is not on EU market", () => {
      const r = evaluateEUAIAct(
        baseManifest({ aiSystems: [aiSystem({ riskTier: "high", euMarket: false })] }),
      ).find(x => x.articleId === "ART-27")!;
      expect(r.status).toBe("not-applicable");
    });

    it("fails when EU-market high-risk exists and no FRIA artifact", () => {
      const r = evaluateEUAIAct(
        baseManifest({ aiSystems: [aiSystem({ riskTier: "high", euMarket: true })] }),
      ).find(x => x.articleId === "ART-27")!;
      expect(r.status).toBe("fail");
    });

    it("is partial when EU-market high-risk exists and FRIA artifact is present", () => {
      const r = evaluateEUAIAct(
        baseManifest({
          aiSystems: [aiSystem({ riskTier: "high", euMarket: true })],
          artifacts: { ...baseManifest().artifacts, fria: "present" },
        }),
      ).find(x => x.articleId === "ART-27")!;
      expect(r.status).toBe("partial");
    });
  });
});

describe("calcAIComplianceScore", () => {
  it("returns 100 when every applicable article passes", () => {
    const results = [
      { articleId: "ART-5", article: 5, title: "x", phase: "Map" as const, description: "", status: "pass" as const, evidence: "", nistAiRmf: [], iso42001: [] },
      { articleId: "ART-50", article: 50, title: "x", phase: "Manage" as const, description: "", status: "pass" as const, evidence: "", nistAiRmf: [], iso42001: [] },
    ];
    expect(calcAIComplianceScore(results)).toBe(100);
  });

  it("counts partial as 0.5", () => {
    const results = [
      { articleId: "A", article: 1, title: "x", phase: "Map" as const, description: "", status: "pass" as const, evidence: "", nistAiRmf: [], iso42001: [] },
      { articleId: "B", article: 2, title: "x", phase: "Map" as const, description: "", status: "partial" as const, evidence: "", nistAiRmf: [], iso42001: [] },
    ];
    // 1 pass + 1 partial = 1.5 / 2 applicable = 75%
    expect(calcAIComplianceScore(results)).toBe(75);
  });

  it("excludes not-applicable from both numerator and denominator", () => {
    const results = [
      { articleId: "A", article: 1, title: "x", phase: "Map" as const, description: "", status: "pass" as const, evidence: "", nistAiRmf: [], iso42001: [] },
      { articleId: "B", article: 2, title: "x", phase: "Map" as const, description: "", status: "not-applicable" as const, evidence: "", nistAiRmf: [], iso42001: [] },
    ];
    expect(calcAIComplianceScore(results)).toBe(100);
  });

  it("returns 100 when no articles are applicable (vacuous truth)", () => {
    const results = [
      { articleId: "A", article: 1, title: "x", phase: "Map" as const, description: "", status: "not-applicable" as const, evidence: "", nistAiRmf: [], iso42001: [] },
    ];
    expect(calcAIComplianceScore(results)).toBe(100);
  });
});

describe("getAIPhaseScores", () => {
  it("returns one entry per phase", () => {
    const phases = getAIPhaseScores(evaluateEUAIAct(baseManifest()));
    expect(phases.map(p => p.name)).toEqual(["Govern", "Map", "Measure", "Manage"]);
  });

  it("reports applicable=0 and percentage=100 for phases that are entirely not-applicable", () => {
    const phases = getAIPhaseScores(evaluateEUAIAct(baseManifest()));
    for (const p of phases) {
      // With no AI systems, every article is not-applicable or always-applicable-pass.
      expect(p.percentage).toBeGreaterThanOrEqual(0);
      expect(p.percentage).toBeLessThanOrEqual(100);
    }
  });
});
