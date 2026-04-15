import { join } from "node:path";
import { ScanContext, ArtifactStatus } from "../types.js";
import { fileExists } from "../utils.js";

/**
 * Check if policy files exist at the expected output locations.
 * The scanner generates policies into config.outputDir (default: docs/policies/).
 * security.txt lives at .well-known/security.txt per RFC 9116.
 */
export async function scanArtifacts(ctx: ScanContext, outputDir: string): Promise<ArtifactStatus> {
  const check = async (relativePath: string) =>
    fileExists(join(ctx.repoPath, relativePath));

  const [
    hasPrivacyPolicy,
    hasTerms,
    hasSecurityTxt,
    hasVulnDisclosure,
    hasIrp,
  ] = await Promise.all([
    check(join(outputDir, "privacy-policy.md")),
    check(join(outputDir, "terms-of-service.md")),
    check(".well-known/security.txt"),
    check(join(outputDir, "vulnerability-disclosure.md")),
    check(join(outputDir, "incident-response-plan.md")),
  ]);

  return {
    privacyPolicy: hasPrivacyPolicy ? "generated" : "missing",
    termsOfService: hasTerms ? "generated" : "missing",
    securityTxt: hasSecurityTxt ? "present" : "missing",
    vulnerabilityDisclosure: hasVulnDisclosure ? "present" : "missing",
    incidentResponsePlan: hasIrp ? "present" : "missing",
  };
}
