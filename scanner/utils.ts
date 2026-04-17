import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const SCANNABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".rs",
  ".html", ".htm", ".hbs", ".ejs", ".pug", ".njk", ".mustache",
  ".vue", ".svelte",
  ".json", ".yml", ".yaml", ".toml",
  ".php", ".cs", ".swift", ".kt",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "vendor", ".venv", "venv", "target", "coverage", ".grc",
]);

export async function walkFiles(
  dir: string,
  extensions?: Set<string>
): Promise<string[]> {
  const results: string[] = [];
  const exts = extensions ?? SCANNABLE_EXTENSIONS;

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (exts.has(extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function relativePath(repoPath: string, fullPath: string): string {
  return fullPath.replace(repoPath + "/", "");
}

/**
 * Shallow list of entries in a directory. Returns an empty array when the
 * directory does not exist, so callers don't need to gate on fileExists.
 */
export async function listDirectory(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
