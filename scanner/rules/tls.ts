import { ScanContext, TlsInfo } from "../types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function scanTls(ctx: ScanContext): Promise<TlsInfo | null> {
  if (!ctx.siteUrl) return null;

  try {
    const url = new URL(ctx.siteUrl);
    const hostname = url.hostname;
    const port = url.port || "443";

    // Check if HTTPS is enforced (HTTP redirects to HTTPS)
    let enforced = false;
    try {
      const httpUrl = `http://${hostname}`;
      const response = await fetch(httpUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      const location = response.headers.get("location");
      enforced = response.status >= 300 && response.status < 400 && (location?.startsWith("https://") ?? false);
    } catch {
      // If HTTP connection fails entirely, that's also fine
      enforced = url.protocol === "https:";
    }

    // Get certificate expiry using openssl
    let certExpiry: string | null = null;
    try {
      const { stdout } = await exec("bash", [
        "-c",
        `echo | openssl s_client -servername ${hostname} -connect ${hostname}:${port} 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null`,
      ], { timeout: 10000 });

      const match = stdout.match(/notAfter=(.+)/);
      if (match) {
        const date = new Date(match[1]);
        certExpiry = date.toISOString().split("T")[0];
      }
    } catch {
      // openssl not available or connection failed
    }

    return { enforced, certExpiry };
  } catch (e) {
    console.warn(`[tls] Could not check TLS for ${ctx.siteUrl}: ${e}`);
    return null;
  }
}
