/**
 * Seed the local wrangler dev KV with a handful of fixture manifests so
 * the v2 dashboard has realistic content to display.
 *
 * Run with: GRC_AUTH_BYPASS=1 npx wrangler dev (in another terminal), then
 *           tsx scripts/seed-local.ts
 */

import type { Manifest } from "../scanner/types.js";

const BASE = process.env.DASH_URL || "http://127.0.0.1:8787";

function artifactsClean(): Manifest["artifacts"] {
  return {
    privacyPolicy: "generated",
    termsOfService: "generated",
    securityTxt: "present",
    vulnerabilityDisclosure: "present",
    incidentResponsePlan: "present",
    aiUsagePolicy: "present",
    modelCards: "not-applicable",
    fria: "not-applicable",
  };
}

function fixtures(): Array<{ manifest: Manifest; siteUrl: string }> {
  return [
    {
      manifest: {
        repo: "acme/storefront",
        scanDate: new Date().toISOString(),
        branch: "main",
        commit: "a1b2c3d",
        dataCollection: [
          { type: "pii", field: "email", source: "form", file: "app/signup.tsx" },
          { type: "pii", field: "name", source: "form", file: "app/signup.tsx" },
          { type: "cookie", field: "session_id", source: "api-input", file: "lib/session.ts" },
        ] as any,
        thirdPartyServices: [
          { name: "Stripe", category: "payments", dpaUrl: "https://stripe.com/dpa" },
          { name: "Sentry", category: "monitoring", dpaUrl: "https://sentry.io/legal/dpa/" },
          { name: "PostHog", category: "analytics" },
        ] as any,
        securityHeaders: {
          csp: "present", hsts: "present", xFrameOptions: "present",
          xContentTypeOptions: "present", referrerPolicy: "present", permissionsPolicy: "missing",
        },
        https: { enforced: true, certExpiry: "2026-11-30" },
        dependencies: {
          total: 412, criticalVulnerabilities: 0, highVulnerabilities: 1,
          mediumVulnerabilities: 4, lastAudit: new Date().toISOString().slice(0, 10),
        } as any,
        secretsScan: { detected: false, findings: [] },
        artifacts: artifactsClean(),
        accessControls: { branchProtection: true, requiredReviews: 2, signedCommits: true },
        aiSystems: [
          {
            provider: "OpenAI", sdk: "openai", location: "package.json",
            category: "inference", dataFlows: [], riskTier: "limited",
            riskTierSource: "heuristic", euMarket: true,
            usageLocations: ["app/search/suggest.ts"],
          } as any,
        ],
      },
      siteUrl: "https://acme-storefront.example.com",
    },
    {
      manifest: {
        repo: "acme/hiring-portal",
        scanDate: new Date(Date.now() - 3_600_000).toISOString(),
        branch: "main",
        commit: "e4f5g6h",
        dataCollection: [
          { type: "pii", field: "resume", source: "form", file: "app/apply.tsx" },
        ] as any,
        thirdPartyServices: [
          { name: "Greenhouse", category: "ats" },
        ] as any,
        securityHeaders: {
          csp: "missing", hsts: "present", xFrameOptions: "present",
          xContentTypeOptions: "present", referrerPolicy: "missing", permissionsPolicy: "missing",
        },
        https: { enforced: true, certExpiry: "2026-08-15" },
        dependencies: {
          total: 203, criticalVulnerabilities: 1, highVulnerabilities: 3,
          mediumVulnerabilities: 7, lastAudit: new Date().toISOString().slice(0, 10),
        } as any,
        secretsScan: { detected: false, findings: [] },
        artifacts: { ...artifactsClean(), modelCards: "missing", fria: "missing" },
        accessControls: { branchProtection: true, requiredReviews: 1, signedCommits: false },
        aiSystems: [
          {
            provider: "OpenAI", sdk: "openai", location: "package.json",
            category: "inference", dataFlows: [], riskTier: "high",
            riskTierSource: "heuristic", euMarket: true,
            usageLocations: ["app/hiring/screen-resume.ts"],
            riskReasoning: "Employment decision — Annex III high-risk use case.",
          } as any,
        ],
      },
      siteUrl: "https://jobs.acme.example.com",
    },
    {
      manifest: {
        repo: "acme/internal-docs",
        scanDate: new Date(Date.now() - 86_400_000).toISOString(),
        branch: "main",
        commit: "i7j8k9l",
        dataCollection: [],
        thirdPartyServices: [],
        securityHeaders: null,
        https: null,
        dependencies: {
          total: 89, criticalVulnerabilities: 0, highVulnerabilities: 0,
          mediumVulnerabilities: 0, lastAudit: new Date().toISOString().slice(0, 10),
        } as any,
        secretsScan: { detected: true, findings: ["Stripe live key found in scripts/deploy.sh:14"] },
        artifacts: {
          privacyPolicy: "missing", termsOfService: "missing",
          securityTxt: "missing", vulnerabilityDisclosure: "missing",
          incidentResponsePlan: "missing",
        },
        accessControls: { branchProtection: false, requiredReviews: 0, signedCommits: false },
        aiSystems: [],
      },
      siteUrl: "",
    },
  ];
}

async function main() {
  let posted = 0;
  for (const { manifest, siteUrl } of fixtures()) {
    const url = `${BASE}/api/report${siteUrl ? `?site_url=${encodeURIComponent(siteUrl)}` : ""}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest),
    });
    if (!res.ok) {
      console.error(`FAIL ${manifest.repo}: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    console.log(`ok  ${manifest.repo}`);
    posted++;
  }
  console.log(`\nSeeded ${posted} fixture repos. Open ${BASE}/`);
}

main();
