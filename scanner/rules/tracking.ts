import { ScanContext, DataCollectionPoint } from "../types.js";
import { walkFiles, readFileContent, relativePath } from "../utils.js";

const HTML_AND_JS = new Set([
  ".html", ".htm", ".hbs", ".ejs", ".pug", ".njk",
  ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte",
]);

const TRACKING_PATTERNS = [
  { pattern: /google-analytics\.com|googletagmanager\.com|gtag\(/gi, service: "Google Analytics", dataShared: ["ip_address", "browsing_behavior", "device_info"] },
  { pattern: /mixpanel\.track|mixpanel\.init/gi, service: "Mixpanel", dataShared: ["user_events", "device_info"] },
  { pattern: /hotjar\.com|hj\s*\(\s*["']/gi, service: "Hotjar", dataShared: ["browsing_behavior", "session_recordings", "device_info"] },
  { pattern: /facebook\.com\/tr|fbq\s*\(/gi, service: "Facebook Pixel", dataShared: ["browsing_behavior", "ip_address"] },
  { pattern: /plausible\.io/gi, service: "Plausible Analytics", dataShared: ["page_views"] },
  { pattern: /analytics\.js|analytics\.min\.js/gi, service: "Unknown Analytics", dataShared: ["browsing_behavior"] },
  { pattern: /heap\.track|heap\.identify/gi, service: "Heap", dataShared: ["user_events", "device_info"] },
  { pattern: /amplitude\.track|amplitude\.init/gi, service: "Amplitude", dataShared: ["user_events", "device_info"] },
  { pattern: /posthog\.capture|posthog\.init/gi, service: "PostHog", dataShared: ["user_events", "device_info"] },
  { pattern: /clarity\.ms|clarity\s*\(/gi, service: "Microsoft Clarity", dataShared: ["session_recordings", "browsing_behavior"] },
];

export async function scanTracking(ctx: ScanContext): Promise<DataCollectionPoint[]> {
  const files = await walkFiles(ctx.repoPath, HTML_AND_JS);
  const results: DataCollectionPoint[] = [];
  const foundServices = new Set<string>();

  for (const file of files) {
    const content = await readFileContent(file);

    for (const { pattern, service, dataShared } of TRACKING_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content) && !foundServices.has(service)) {
        foundServices.add(service);
        results.push({
          type: "tracking",
          source: service.toLowerCase().replace(/\s+/g, "-"),
          location: relativePath(ctx.repoPath, file),
          processor: service,
          retention: "unknown",
          fields: dataShared,
        });
      }
    }
  }

  return results;
}
