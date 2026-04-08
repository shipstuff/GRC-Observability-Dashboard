import { join } from "node:path";
import { ScanContext, ThirdPartyService, DependencyInfo } from "../types.js";
import { readFileContent, fileExists } from "../utils.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Known third-party services and their data implications
const KNOWN_SERVICES: Record<string, { name: string; purpose: string; dataShared: string[]; dpaUrl: string | null }> = {
  // Email
  "resend": { name: "Resend", purpose: "email delivery", dataShared: ["email", "name", "message_body"], dpaUrl: "https://resend.com/legal/dpa" },
  "@sendgrid/mail": { name: "SendGrid", purpose: "email delivery", dataShared: ["email", "name", "message_body"], dpaUrl: "https://www.twilio.com/legal/data-protection-addendum" },
  "nodemailer": { name: "Nodemailer (self-hosted)", purpose: "email delivery", dataShared: ["email"], dpaUrl: null },
  "postmark": { name: "Postmark", purpose: "email delivery", dataShared: ["email", "name", "message_body"], dpaUrl: "https://postmarkapp.com/eu-privacy" },

  // Analytics
  "@google-analytics/data": { name: "Google Analytics", purpose: "analytics", dataShared: ["ip_address", "browsing_behavior", "device_info"], dpaUrl: "https://privacy.google.com/businesses/processorterms/" },
  "mixpanel": { name: "Mixpanel", purpose: "analytics", dataShared: ["user_events", "device_info"], dpaUrl: "https://mixpanel.com/legal/dpa/" },
  "@segment/analytics-node": { name: "Segment", purpose: "analytics", dataShared: ["user_events", "identifiers"], dpaUrl: "https://segment.com/legal/dpa/" },
  "posthog-node": { name: "PostHog", purpose: "analytics", dataShared: ["user_events", "device_info"], dpaUrl: "https://posthog.com/dpa" },

  // Payments
  "stripe": { name: "Stripe", purpose: "payment processing", dataShared: ["payment_info", "email", "name", "address"], dpaUrl: "https://stripe.com/privacy" },
  "@paypal/checkout-server-sdk": { name: "PayPal", purpose: "payment processing", dataShared: ["payment_info", "email", "name"], dpaUrl: "https://www.paypal.com/us/legalhub/dpa-full" },

  // Auth
  "next-auth": { name: "NextAuth.js", purpose: "authentication", dataShared: ["email", "name", "oauth_tokens"], dpaUrl: null },
  "passport": { name: "Passport.js", purpose: "authentication", dataShared: ["credentials", "oauth_tokens"], dpaUrl: null },
  "@clerk/clerk-sdk-node": { name: "Clerk", purpose: "authentication", dataShared: ["email", "name", "oauth_tokens"], dpaUrl: "https://clerk.com/legal/dpa" },
  "@auth0/auth0-spa-js": { name: "Auth0", purpose: "authentication", dataShared: ["email", "name", "oauth_tokens"], dpaUrl: "https://auth0.com/docs/secure/data-privacy-and-compliance" },

  // Error tracking
  "@sentry/node": { name: "Sentry", purpose: "error tracking", dataShared: ["ip_address", "error_data", "user_context"], dpaUrl: "https://sentry.io/legal/dpa/" },
  "@sentry/browser": { name: "Sentry", purpose: "error tracking", dataShared: ["ip_address", "error_data", "user_context"], dpaUrl: "https://sentry.io/legal/dpa/" },

  // CDN/Hosting
  "aws-sdk": { name: "AWS", purpose: "cloud infrastructure", dataShared: ["varies_by_service"], dpaUrl: "https://aws.amazon.com/compliance/data-privacy/" },
  "@google-cloud/storage": { name: "Google Cloud", purpose: "cloud storage", dataShared: ["uploaded_files"], dpaUrl: "https://cloud.google.com/terms/data-processing-addendum" },

  // Database (hosted)
  "@prisma/client": { name: "Prisma (self-hosted DB)", purpose: "database ORM", dataShared: [], dpaUrl: null },
  "mongoose": { name: "MongoDB", purpose: "database", dataShared: [], dpaUrl: null },

  // Chat/Support
  "intercom-client": { name: "Intercom", purpose: "customer support", dataShared: ["email", "name", "chat_messages"], dpaUrl: "https://www.intercom.com/legal/data-processing-agreement" },
};

export async function scanDependencies(ctx: ScanContext): Promise<{ services: ThirdPartyService[]; deps: DependencyInfo | null }> {
  const services: ThirdPartyService[] = [];
  let deps: DependencyInfo | null = null;

  // Check package.json (Node.js)
  const pkgPath = join(ctx.repoPath, "package.json");
  if (await fileExists(pkgPath)) {
    const content = await readFileContent(pkgPath);
    const pkg = JSON.parse(content);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [depName, _version] of Object.entries(allDeps)) {
      const known = KNOWN_SERVICES[depName];
      if (known) {
        // Avoid duplicate service names
        if (!services.find(s => s.name === known.name)) {
          services.push({
            name: known.name,
            purpose: known.purpose,
            dataShared: known.dataShared,
            dpaUrl: known.dpaUrl,
          });
        }
      }
    }

    // Run npm audit if package-lock.json exists
    const lockPath = join(ctx.repoPath, "package-lock.json");
    if (await fileExists(lockPath)) {
      try {
        const { stdout } = await exec("npm", ["audit", "--json"], {
          cwd: ctx.repoPath,
          timeout: 30000,
        });
        const audit = JSON.parse(stdout);
        const vuln = audit.metadata?.vulnerabilities || {};
        deps = {
          criticalVulnerabilities: vuln.critical || 0,
          highVulnerabilities: vuln.high || 0,
          mediumVulnerabilities: vuln.moderate || 0,
          outdatedPackages: 0,
          lastAudit: new Date().toISOString().split("T")[0],
        };
      } catch (e: any) {
        // npm audit exits non-zero when vulnerabilities are found
        try {
          const audit = JSON.parse(e.stdout || "{}");
          const vuln = audit.metadata?.vulnerabilities || {};
          deps = {
            criticalVulnerabilities: vuln.critical || 0,
            highVulnerabilities: vuln.high || 0,
            mediumVulnerabilities: vuln.moderate || 0,
            outdatedPackages: 0,
            lastAudit: new Date().toISOString().split("T")[0],
          };
        } catch {
          // Can't parse audit output, skip
        }
      }
    }
  }

  // Check requirements.txt (Python)
  const reqPath = join(ctx.repoPath, "requirements.txt");
  if (await fileExists(reqPath)) {
    // Future: add Python package scanning
  }

  // Check go.mod (Go)
  const goModPath = join(ctx.repoPath, "go.mod");
  if (await fileExists(goModPath)) {
    // Future: add Go module scanning
  }

  return { services, deps };
}
