
import { ScanContext, DataCollectionPoint } from "../types.js";
import { walkFiles, readFileContent, relativePath } from "../utils.js";

// Skip dependency manifests and lock files — handled by dependencies rule
const SKIP_FILES = new Set([
  "package.json", "package-lock.json", "yarn.lock", "bun.lock",
  "requirements.txt", "Pipfile", "Pipfile.lock", "poetry.lock",
  "Gemfile", "Gemfile.lock", "go.mod", "go.sum",
  "Cargo.toml", "Cargo.lock", "pom.xml", "build.gradle",
]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".php",
  ".html", ".htm", ".hbs", ".ejs", ".vue", ".svelte",
]);

const COOKIE_PATTERNS = [
  { pattern: /res\.cookie\s*\(/g, type: "server" },
  { pattern: /response\.cookie\s*\(/g, type: "server" },
  { pattern: /Set-Cookie/gi, type: "server" },
  { pattern: /document\.cookie\s*=/g, type: "client" },
  { pattern: /cookies?\.set\s*\(/g, type: "client" },
  { pattern: /js-cookie/g, type: "client" },
  { pattern: /cookie-parser/g, type: "server" },
];

export async function scanCookies(ctx: ScanContext): Promise<DataCollectionPoint[]> {
  const files = await walkFiles(ctx.repoPath, CODE_EXTENSIONS);
  const results: DataCollectionPoint[] = [];

  for (const file of files) {
    const basename = file.split("/").pop() || "";
    if (SKIP_FILES.has(basename)) continue;

    const content = await readFileContent(file);

    for (const { pattern, type } of COOKIE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        results.push({
          type: "cookie",
          source: type === "server" ? "server-cookie" : "client-cookie",
          location: relativePath(ctx.repoPath, file),
          processor: "self-hosted",
          retention: "unknown",
          fields: ["cookie_data"],
        });
        break; // One finding per file is enough
      }
    }
  }

  return results;
}
