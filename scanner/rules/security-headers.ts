import { ScanContext, SecurityHeaders } from "../types.js";

export async function scanSecurityHeaders(ctx: ScanContext): Promise<SecurityHeaders | null> {
  if (!ctx.siteUrl) return null;

  try {
    const response = await fetch(ctx.siteUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    const headers = response.headers;

    return {
      csp: headers.has("content-security-policy")
        ? "present"
        : headers.has("content-security-policy-report-only")
          ? "partial"
          : "missing",
      hsts: headers.has("strict-transport-security") ? "present" : "missing",
      xFrameOptions: headers.has("x-frame-options") ? "present" : "missing",
      xContentTypeOptions: headers.has("x-content-type-options") ? "present" : "missing",
      referrerPolicy: headers.has("referrer-policy") ? "present" : "missing",
      permissionsPolicy: headers.has("permissions-policy") ? "present" : "missing",
    };
  } catch (e) {
    console.warn(`[security-headers] Could not reach ${ctx.siteUrl}: ${e}`);
    return null;
  }
}
