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
const _SENSITIVE_OPS = [
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
  // Uses the non-admin branches endpoint (returns "protected" boolean)
  // Detailed rules (reviewer count, signed commits) require admin access
  // so we infer what we can from the basic API
  const controls: AccessControls = {
    branchProtection: null,
    requiredReviews: null,
    signedCommits: null,
  };

  try {
    await exec("gh", ["--version"], { timeout: 5000 });

    // Rulesets API: GET /repos/{owner}/{repo}/rules/branches/{branch}
    // Returns the effective rules applied to a branch. Works with standard
    // GITHUB_TOKEN scope (no admin required). Covers the newer GitHub
    // Rulesets AND legacy branch protection rules (both surface here).
    let rules: Array<{ type: string; parameters?: Record<string, unknown> }> = [];
    try {
      const { stdout: rulesOut } = await exec("gh", [
        "api", `repos/${ctx.repoName}/rules/branches/main`,
      ], { cwd: ctx.repoPath, timeout: 10000 });
      rules = JSON.parse(rulesOut);
    } catch {
      // Rulesets API not accessible — fall back to the branches endpoint
      // which at least tells us if SOME protection exists
      try {
        const { stdout } = await exec("gh", [
          "api", `repos/${ctx.repoName}/branches/main`,
          "--jq", ".protected",
        ], { cwd: ctx.repoPath, timeout: 10000 });
        const isProtected = stdout.trim() === "true";
        controls.branchProtection = isProtected;
        if (isProtected) {
          findings.push({
            type: "auth-present",
            location: "GitHub",
            detail: "Branch protection enabled (details unavailable — needs elevated scope)",
            severity: "info",
          });
        } else {
          findings.push({
            type: "unprotected-route",
            location: "GitHub",
            detail: "No branch protection rules found on main branch",
            severity: "warning",
          });
        }
      } catch {
        controls.branchProtection = null;
      }
      // Done — can't read detailed rules
      rules = [];
    }

    if (rules.length > 0) {
      controls.branchProtection = true;

      // Aggregate ALL pull_request rules (org-level + repo-level can both apply).
      // Use the strictest required_approving_review_count across all of them.
      const prRules = rules.filter(r => r.type === "pull_request");
      if (prRules.length > 0) {
        const counts: number[] = [];
        for (const r of prRules) {
          const count = r.parameters?.["required_approving_review_count"];
          if (typeof count === "number") counts.push(count);
        }
        if (counts.length > 0) {
          controls.requiredReviews = Math.max(...counts);
        }
      }

      // required_signatures rule means signed commits are enforced
      controls.signedCommits = rules.some(r => r.type === "required_signatures");

      // Surface what we found (de-duplicated rule types)
      const ruleTypes = [...new Set(rules.map(r => r.type))].join(", ");
      findings.push({
        type: "auth-present",
        location: "GitHub",
        detail: `Branch protection enabled. Rules: ${ruleTypes}.${controls.requiredReviews !== null ? ` Required reviews: ${controls.requiredReviews}.` : ""} Signed commits: ${controls.signedCommits ? "required" : "not required"}.`,
        severity: "info",
      });

      // Flag signed-commits specifically if not enforced
      if (!controls.signedCommits) {
        findings.push({
          type: "unprotected-route",
          location: "GitHub",
          detail: "Signed commits are not required on main. Consider enabling for supply-chain integrity.",
          severity: "info",
        });
      }
    } else if (controls.branchProtection === null) {
      // Rulesets endpoint succeeded but returned []. Main has no active rules.
      // This is different from "CLI unavailable" — main is definitively unprotected.
      controls.branchProtection = false;
      findings.push({
        type: "unprotected-route",
        location: "GitHub",
        detail: "No branch protection rules found on main branch",
        severity: "warning",
      });
    } else if (controls.branchProtection === false) {
      // Already handled; do nothing
    }
  } catch {
    // gh CLI not available
    controls.branchProtection = null;
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
      for (const match of content.matchAll(pattern)) {
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
