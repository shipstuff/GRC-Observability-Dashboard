import { join } from "node:path";
import { ScanContext, ArtifactStatus } from "../types.js";
import { fileExists, walkFiles, readFileContent } from "../utils.js";

const SECURITY_TXT_PATHS = [
  ".well-known/security.txt",
  "public/.well-known/security.txt",
  "static/.well-known/security.txt",
  "src/.well-known/security.txt",
];

const DISCLOSURE_PATTERNS = [
  /vulnerability.?disclosure/i,
  /responsible.?disclosure/i,
  /security.?policy/i,
  /bug.?bounty/i,
];

const IRP_PATTERNS = [
  /incident.?response/i,
  /incident.?plan/i,
  /irp/i,
];

async function findFileByPatterns(repoPath: string, patterns: RegExp[]): Promise<boolean> {
  // Check common doc locations
  const docDirs = ["docs", "doc", ".", "policies", "security"];
  for (const dir of docDirs) {
    const fullDir = join(repoPath, dir);
    try {
      const files = await walkFiles(fullDir, new Set([".md", ".txt", ".html", ".htm"]));
      for (const file of files) {
        for (const pattern of patterns) {
          if (pattern.test(file)) return true;
        }
        // Also check file content for the pattern
        const content = await readFileContent(file);
        for (const pattern of patterns) {
          if (pattern.test(content.slice(0, 500))) return true;
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }
  return false;
}

export async function scanArtifacts(ctx: ScanContext): Promise<ArtifactStatus> {
  // Check for security.txt
  let securityTxt: "present" | "missing" = "missing";
  for (const path of SECURITY_TXT_PATHS) {
    if (await fileExists(join(ctx.repoPath, path))) {
      securityTxt = "present";
      break;
    }
  }

  // Check for vulnerability disclosure
  const hasDisclosure = await findFileByPatterns(ctx.repoPath, DISCLOSURE_PATTERNS);

  // Check for incident response plan
  const hasIrp = await findFileByPatterns(ctx.repoPath, IRP_PATTERNS);

  // Check for existing privacy policy (manual)
  const privacyPaths = ["privacy-policy", "privacy", "legal/privacy"];
  let hasManualPrivacy = false;
  for (const p of privacyPaths) {
    for (const ext of [".md", ".html", ".htm", ".txt"]) {
      if (await fileExists(join(ctx.repoPath, p + ext))) {
        hasManualPrivacy = true;
        break;
      }
    }
  }

  // Check for existing ToS (manual)
  const tosPaths = ["terms-of-service", "terms", "tos", "legal/terms"];
  let hasManualTos = false;
  for (const p of tosPaths) {
    for (const ext of [".md", ".html", ".htm", ".txt"]) {
      if (await fileExists(join(ctx.repoPath, p + ext))) {
        hasManualTos = true;
        break;
      }
    }
  }

  return {
    privacyPolicy: hasManualPrivacy ? "manual" : "missing",
    termsOfService: hasManualTos ? "manual" : "missing",
    securityTxt,
    vulnerabilityDisclosure: hasDisclosure ? "present" : "missing",
    incidentResponsePlan: hasIrp ? "present" : "missing",
  };
}
