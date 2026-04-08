import { ScanContext, AccessControls } from "../types.js";
import { walkFiles, readFileContent, relativePath } from "../utils.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".php",
]);

export interface AuthFinding {
  type: "unprotected-route" | "hardcoded-role" | "auth-present";
  location: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

// Patterns that indicate authentication/authorization middleware
const AUTH_MIDDLEWARE_PATTERNS = [
  /(?:requireAuth|isAuthenticated|authenticate|ensureLoggedIn|passport\.authenticate|verifyToken|authMiddleware|requireLogin|checkAuth|isAdmin|requireRole|authorize)\s*[\(,]/g,
  /(?:jwt\.verify|jsonwebtoken|express-jwt|passport)/g,
  /(?:req\.isAuthenticated|req\.user|req\.session\.user)/g,
  /(?:@Authorized|@UseGuards|@Auth|@Login)/g, // Decorators (NestJS, etc.)
];

// Patterns that indicate admin/sensitive routes
const ADMIN_ROUTE_PATTERNS = [
  { pattern: /\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]*(?:admin|dashboard|manage|settings|config|internal|api\/v\d+\/(?:users|roles|permissions))[^"'`]*)["'`]/gi, label: "admin-route" },
  { pattern: /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]*(?:admin|dashboard|manage|settings|config|internal)[^"'`]*)["'`]/gi, label: "admin-route" },
  { pattern: /\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]*(?:delete|destroy|drop|reset|purge)[^"'`]*)["'`]/gi, label: "destructive-route" },
];

// Patterns that indicate sensitive operations without auth context
const SENSITIVE_OPS = [
  { pattern: /process\.env\[|process\.env\./g, label: "env-access" },
  { pattern: /\.exec\s*\(|child_process|spawn\s*\(/g, label: "command-execution" },
  { pattern: /fs\.(?:writeFile|unlink|rmdir|rm)\s*\(/g, label: "filesystem-write" },
];

export async function scanAccessControls(ctx: ScanContext): Promise<{
  controls: AccessControls;
  findings: AuthFinding[];
}> {
  const findings: AuthFinding[] = [];

  // Check GitHub branch protection via gh CLI if available
  let controls: AccessControls = {
    branchProtection: null,
    requiredReviews: null,
    signedCommits: null,
  };

  try {
    const { stdout } = await exec("gh", [
      "api", `repos/${ctx.repoName}/branches/main/protection`,
      "--jq", JSON.stringify({
        enforceAdmins: ".enforce_admins.enabled",
        requiredReviews: ".required_pull_request_reviews.required_approving_review_count",
        signedCommits: ".required_signatures.enabled",
      }),
    ], { cwd: ctx.repoPath, timeout: 10000 });

    const data = JSON.parse(stdout);
    controls = {
      branchProtection: true, // if the API call succeeded, protection exists
      requiredReviews: typeof data.requiredReviews === "number" ? data.requiredReviews : 0,
      signedCommits: data.signedCommits === true,
    };

    findings.push({
      type: "auth-present",
      location: "GitHub",
      detail: `Branch protection enabled. Required reviews: ${controls.requiredReviews}. Signed commits: ${controls.signedCommits ? "yes" : "no"}.`,
      severity: "info",
    });
  } catch {
    // gh CLI not available or no branch protection
    try {
      // Check if gh is available at all
      await exec("gh", ["--version"], { timeout: 5000 });
      // gh works but branch protection may not be set
      controls.branchProtection = false;
      findings.push({
        type: "unprotected-route",
        location: "GitHub",
        detail: "No branch protection rules found on main branch",
        severity: "warning",
      });
    } catch {
      // gh CLI not available
      controls.branchProtection = null;
    }
  }

  // Scan code for auth patterns
  const files = await walkFiles(ctx.repoPath, CODE_EXTENSIONS);

  for (const file of files) {
    const content = await readFileContent(file);
    const rel = relativePath(ctx.repoPath, file);

    // Check if file has auth middleware
    let hasAuth = false;
    for (const pattern of AUTH_MIDDLEWARE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        hasAuth = true;
        break;
      }
    }

    // Check for admin/sensitive routes
    for (const { pattern, label } of ADMIN_ROUTE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const route = match[2];

        // Check if this route file has any auth patterns
        if (!hasAuth) {
          findings.push({
            type: "unprotected-route",
            location: rel,
            detail: `${method} ${route} — appears to be a sensitive route with no authentication middleware detected in this file`,
            severity: label === "destructive-route" ? "critical" : "warning",
          });
        } else {
          findings.push({
            type: "auth-present",
            location: rel,
            detail: `${method} ${route} — authentication middleware detected`,
            severity: "info",
          });
        }
      }
    }
  }

  return { controls, findings };
}

export function generateAccessControlReport(
  controls: AccessControls,
  findings: AuthFinding[]
): string {
  const lines: string[] = [
    "# Access Controls Report\n",
  ];

  // GitHub section
  lines.push("## GitHub Repository Controls\n");
  if (controls.branchProtection === null) {
    lines.push("GitHub CLI (`gh`) not available — could not check branch protection settings.\n");
    lines.push("To enable this check, install the [GitHub CLI](https://cli.github.com/) and authenticate.\n");
  } else if (controls.branchProtection) {
    lines.push("| Control | Status |");
    lines.push("|---------|--------|");
    lines.push(`| Branch protection | ENABLED |`);
    lines.push(`| Required reviews | ${controls.requiredReviews ?? "not set"} |`);
    lines.push(`| Signed commits | ${controls.signedCommits ? "required" : "not required"} |`);
    lines.push("");
  } else {
    lines.push("**Branch protection is NOT enabled on main.** This is a critical access control gap.\n");
    lines.push("### Recommended settings:\n");
    lines.push("- Require pull request reviews before merging (minimum 1 reviewer)");
    lines.push("- Require status checks to pass before merging");
    lines.push("- Restrict who can push to main");
    lines.push("- Consider requiring signed commits\n");
    lines.push("```bash");
    lines.push("# Enable via GitHub CLI:");
    lines.push("gh api repos/{owner}/{repo}/branches/main/protection \\");
    lines.push("  --method PUT \\");
    lines.push("  -f 'required_pull_request_reviews[required_approving_review_count]=1' \\");
    lines.push("  -f 'enforce_admins=true'");
    lines.push("```\n");
  }

  // Code-level auth findings
  const warnings = findings.filter(f => f.severity === "warning" || f.severity === "critical");
  const infos = findings.filter(f => f.severity === "info");

  if (warnings.length > 0) {
    lines.push("## Findings Requiring Attention\n");
    lines.push("| Severity | Location | Detail |");
    lines.push("|----------|----------|--------|");
    for (const f of warnings) {
      lines.push(`| ${f.severity.toUpperCase()} | \`${f.location}\` | ${f.detail} |`);
    }
    lines.push("");
  }

  if (infos.length > 0) {
    lines.push("## Controls Detected\n");
    for (const f of infos) {
      lines.push(`- **${f.location}:** ${f.detail}`);
    }
    lines.push("");
  }

  if (warnings.length === 0 && infos.length === 0) {
    lines.push("## Code-Level Authentication\n");
    lines.push("No admin or sensitive routes detected in the codebase. If you add admin functionality, ensure authentication middleware is applied.\n");
  }

  return lines.join("\n");
}
