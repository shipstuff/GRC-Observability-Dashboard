import { describe, expect, it } from "vitest";
import type { AISystem } from "../types.js";
import { classifyAISystems, applyAISystemOverrides } from "./ai-risk-classifier.js";

function sys(overrides: Partial<AISystem> = {}): AISystem {
  return {
    provider: "OpenAI",
    sdk: "openai",
    location: "package.json",
    category: "inference",
    dataFlows: [],
    ...overrides,
  };
}

describe("classifyAISystems", () => {
  describe("prohibited keyword matches", () => {
    it("flags systems whose location contains social-score as prohibited", () => {
      const [result] = classifyAISystems([sys({ location: "src/social-score/rank.ts" })]);
      expect(result?.riskTier).toBe("prohibited");
      expect(result?.riskTierSource).toBe("heuristic");
      expect(result?.riskReasoning).toMatch(/Article 5/);
    });

    it("flags usageLocations containing subliminal as prohibited even when location is a manifest", () => {
      const [result] = classifyAISystems([
        sys({ location: "package.json", usageLocations: ["src/subliminal/nudge.ts"] }),
      ]);
      expect(result?.riskTier).toBe("prohibited");
      expect(result?.riskReasoning).toContain("subliminal");
    });
  });

  describe("high-risk keyword matches", () => {
    it.each([
      ["src/hiring/resume-screen.ts", "hiring"],
      ["services/credit-score/evaluator.py", "credit-score"],
      ["app/medical-dx/recommend.ts", "medical-dx"],
      ["modules/biometric-id/match.ts", "biometric-id"],
    ])("classifies %s as high-risk (matches %s)", (path, keyword) => {
      const [result] = classifyAISystems([
        sys({ location: "package.json", usageLocations: [path] }),
      ]);
      expect(result?.riskTier).toBe("high");
      expect(result?.riskReasoning).toContain(keyword);
      expect(result?.riskReasoning).toMatch(/Annex III/);
    });
  });

  describe("category defaults", () => {
    it("training libraries default to limited", () => {
      const [result] = classifyAISystems([sys({ category: "training", location: "package.json" })]);
      expect(result?.riskTier).toBe("limited");
    });

    it("vector-db defaults to minimal", () => {
      const [result] = classifyAISystems([sys({ category: "vector-db", location: "package.json" })]);
      expect(result?.riskTier).toBe("minimal");
    });

    it("self-hosted defaults to minimal", () => {
      const [result] = classifyAISystems([sys({ category: "self-hosted", location: "package.json" })]);
      expect(result?.riskTier).toBe("minimal");
    });

    it("inference in normal src path defaults to limited", () => {
      const [result] = classifyAISystems([
        sys({ location: "package.json", usageLocations: ["src/chat/handler.ts"] }),
      ]);
      expect(result?.riskTier).toBe("limited");
    });

    it("framework in normal src path defaults to limited", () => {
      const [result] = classifyAISystems([
        sys({ category: "framework", location: "package.json", usageLocations: ["src/assistant/index.ts"] }),
      ]);
      expect(result?.riskTier).toBe("limited");
    });
  });

  describe("low-signal downgrade for inference/framework", () => {
    it("downgrades to minimal when usage is confined to test directories", () => {
      const [result] = classifyAISystems([
        sys({ location: "package.json", usageLocations: ["tests/openai-mock.spec.ts", "__tests__/other.test.ts"] }),
      ]);
      expect(result?.riskTier).toBe("minimal");
      expect(result?.riskReasoning).toMatch(/test|dev tooling/i);
    });

    it("stays limited when usage mixes tests and real source", () => {
      const [result] = classifyAISystems([
        sys({ location: "package.json", usageLocations: ["src/chat/handler.ts", "tests/chat.spec.ts"] }),
      ]);
      expect(result?.riskTier).toBe("limited");
    });

    it("stays limited when usage is only in scripts (low-signal) but has no substantive src", () => {
      // Regression guard: scripts/ alone is still low-signal, so this should
      // downgrade. If someone changes LOW_SIGNAL_SEGMENTS later this test
      // will catch the behaviour shift.
      const [result] = classifyAISystems([
        sys({ location: "package.json", usageLocations: ["scripts/migrate.ts"] }),
      ]);
      expect(result?.riskTier).toBe("minimal");
    });
  });

  describe("edge cases", () => {
    it("returns unknown when no usage locations and no category default fits", () => {
      // Unreachable via the AISystem type's current category union, but the
      // classifier defensively handles the case. Cast to any to exercise it.
      const input = sys({ category: "inference" });
      // Mutate to a bogus category to drive the default branch.
      (input as any).category = "weird-category";
      const [result] = classifyAISystems([input]);
      expect(result?.riskTier).toBe("unknown");
    });

    it("preserves all non-classification fields", () => {
      const input = sys({
        provider: "Anthropic",
        sdk: "@anthropic-ai/sdk",
        location: "requirements.txt",
        category: "framework",
        dataFlows: ["user-prompt", "context"],
        usageLocations: ["src/chat/handler.ts"],
      });
      const [result] = classifyAISystems([input]);
      expect(result?.provider).toBe("Anthropic");
      expect(result?.sdk).toBe("@anthropic-ai/sdk");
      expect(result?.location).toBe("requirements.txt");
      expect(result?.category).toBe("framework");
      expect(result?.dataFlows).toEqual(["user-prompt", "context"]);
      expect(result?.usageLocations).toEqual(["src/chat/handler.ts"]);
    });
  });
});

describe("applyAISystemOverrides", () => {
  it("applies the euMarket default to every system when no overrides match", () => {
    const classified = classifyAISystems([sys({ location: "package.json", usageLocations: ["src/chat/handler.ts"] })]);
    const result = applyAISystemOverrides(classified, [], { euMarket: true });
    expect(result[0]?.euMarket).toBe(true);
    expect(result[0]?.riskTierSource).toBe("heuristic");
  });

  it("respects per-system euMarket override and flips riskTierSource to override", () => {
    const classified = classifyAISystems([sys({ location: "package.json", usageLocations: ["src/chat/handler.ts"] })]);
    const result = applyAISystemOverrides(
      classified,
      [{ location: "package.json", riskTier: "high", euMarket: false, purpose: "Internal analytics" }],
      { euMarket: true },
    );
    expect(result[0]?.riskTier).toBe("high");
    expect(result[0]?.riskTierSource).toBe("override");
    expect(result[0]?.euMarket).toBe(false);
    expect(result[0]?.riskReasoning).toContain("Internal analytics");
  });

  it("matches overrides by location + optional name", () => {
    const systems = classifyAISystems([
      sys({ provider: "OpenAI", sdk: "openai", location: "package.json" }),
      sys({ provider: "Anthropic", sdk: "@anthropic-ai/sdk", location: "package.json" }),
    ]);
    const result = applyAISystemOverrides(
      systems,
      [{ location: "package.json", name: "@anthropic-ai/sdk", riskTier: "minimal" }],
      { euMarket: false },
    );
    // Only the Anthropic entry should flip to the override
    expect(result[0]?.riskTierSource).toBe("heuristic");
    expect(result[1]?.riskTierSource).toBe("override");
    expect(result[1]?.riskTier).toBe("minimal");
  });

  it("leaves riskTier unchanged when an override has no riskTier field", () => {
    const classified = classifyAISystems([sys({ location: "package.json", usageLocations: ["src/chat/handler.ts"] })]);
    const originalTier = classified[0]?.riskTier;
    const result = applyAISystemOverrides(
      classified,
      [{ location: "package.json", euMarket: true }], // riskTier deliberately omitted
      { euMarket: false },
    );
    expect(result[0]?.riskTier).toBe(originalTier);
    expect(result[0]?.euMarket).toBe(true);
    // riskTierSource stays heuristic since no tier change was declared
    expect(result[0]?.riskTierSource).toBe("heuristic");
  });

  it("defaults euMarket to false when no defaults arg is provided", () => {
    const classified = classifyAISystems([sys({ location: "package.json", usageLocations: ["src/chat/handler.ts"] })]);
    const result = applyAISystemOverrides(classified, []);
    expect(result[0]?.euMarket).toBe(false);
  });
});
