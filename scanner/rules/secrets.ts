import { ScanContext, SecretsFindings } from "../types.js";
import { walkFiles, readFileContent, relativePath } from "../utils.js";

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([^"']{8,})["']/gi, label: "API key" },
  { pattern: /(?:secret[_-]?key|secret)\s*[:=]\s*["']([^"']{8,})["']/gi, label: "Secret key" },
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{4,})["']/gi, label: "Password" },
  { pattern: /(?:access[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*["']([^"']{8,})["']/gi, label: "Access token" },
  { pattern: /(?:private[_-]?key)\s*[:=]\s*["']([^"']{8,})["']/gi, label: "Private key" },
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, label: "Private key file" },
  { pattern: /(?:aws_access_key_id)\s*[:=]\s*["']?(AKIA[A-Z0-9]{16})["']?/g, label: "AWS access key" },
  { pattern: /(?:aws_secret_access_key)\s*[:=]\s*["']([^"'\s]{20,})["']/gi, label: "AWS secret key" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: "GitHub personal access token" },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: "Stripe/OpenAI secret key" },
  { pattern: /xox[bpors]-[a-zA-Z0-9-]{10,}/g, label: "Slack token" },
];

// Files that are expected to have secret-like patterns (templates, docs, tests)
const SKIP_PATTERNS = [
  /\.example$/,
  /\.sample$/,
  /\.template$/,
  /\.test\./,
  /\.spec\./,
  /\.md$/,
  /\.env\.example/,
  /CLAUDE\.md/,
];

export async function scanSecrets(ctx: ScanContext): Promise<SecretsFindings> {
  const files = await walkFiles(ctx.repoPath);
  const findings: string[] = [];

  for (const file of files) {
    const rel = relativePath(ctx.repoPath, file);

    // Skip files that are expected to have secret-like patterns
    if (SKIP_PATTERNS.some(p => p.test(rel))) continue;

    const content = await readFileContent(file);

    for (const { pattern, label } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        // Don't include the actual secret value — just the location and type
        findings.push(`${label} found in ${rel}`);
        break; // One finding per file is enough
      }
    }
  }

  return {
    detected: findings.length > 0,
    findings,
  };
}
