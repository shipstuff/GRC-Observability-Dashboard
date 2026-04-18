import { join } from "node:path";
import { ScanContext, ArtifactStatus, AISystem } from "../types.js";
import { fileExists, listDirectory } from "../utils.js";

/**
 * Check if policy files exist at the expected output locations.
 * The scanner generates policies into config.outputDir (default: docs/policies/).
 * security.txt lives at .well-known/security.txt per RFC 9116.
 *
 * The AI artifacts (aiUsagePolicy / modelCards / fria) are scoped by whether
 * the codebase actually has AI systems, high-risk systems, and EU-market
 * placement — otherwise "not-applicable" so the dashboard doesn't flag a
 * missing file as a compliance gap when the obligation doesn't apply.
 */
export async function scanArtifacts(
  ctx: ScanContext,
  outputDir: string,
  aiSystems: AISystem[] = [],
): Promise<ArtifactStatus> {
  const check = async (relativePath: string) =>
    fileExists(join(ctx.repoPath, relativePath));

  const [
    hasPrivacyPolicy,
    hasTerms,
    hasSecurityTxt,
    hasVulnDisclosure,
    hasIrp,
    hasAIUsagePolicy,
    hasFRIA,
    modelCardFiles,
  ] = await Promise.all([
    check(join(outputDir, "privacy-policy.md")),
    check(join(outputDir, "terms-of-service.md")),
    check(".well-known/security.txt"),
    check(join(outputDir, "vulnerability-disclosure.md")),
    check(join(outputDir, "incident-response-plan.md")),
    check(join(outputDir, "ai-usage-policy.md")),
    check(join(outputDir, "fria.md")),
    listDirectory(join(ctx.repoPath, outputDir, "model-cards")),
  ]);

  const anyAI = aiSystems.length > 0;
  const anyHighRisk = aiSystems.some(s => s.riskTier === "high" || s.riskTier === "prohibited");
  const anyEuHighRisk = aiSystems.some(s => (s.riskTier === "high" || s.riskTier === "prohibited") && s.euMarket === true);

  const aiUsagePolicy: ArtifactStatus["aiUsagePolicy"] =
    !anyAI ? "not-applicable" : hasAIUsagePolicy ? "present" : "missing";
  const fria: ArtifactStatus["fria"] =
    !anyEuHighRisk ? "not-applicable" : hasFRIA ? "present" : "missing";
  const hasAnyModelCard = modelCardFiles.some(f => f.endsWith(".md"));
  const modelCards: ArtifactStatus["modelCards"] =
    !anyHighRisk ? "not-applicable" : hasAnyModelCard ? "present" : "missing";

  return {
    privacyPolicy: hasPrivacyPolicy ? "generated" : "missing",
    termsOfService: hasTerms ? "generated" : "missing",
    securityTxt: hasSecurityTxt ? "present" : "missing",
    vulnerabilityDisclosure: hasVulnDisclosure ? "present" : "missing",
    incidentResponsePlan: hasIrp ? "present" : "missing",
    aiUsagePolicy,
    modelCards,
    fria,
  };
}
