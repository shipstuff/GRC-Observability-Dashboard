import { ScanContext, DataCollectionPoint } from "../types.js";
import { walkFiles, readFileContent, relativePath } from "../utils.js";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".php",
]);

// Express/Node patterns
const EXPRESS_POST = /\.(post|put|patch)\s*\(\s*["'`]([^"'`]+)["'`]/g;
// req.body field access
const REQ_BODY = /req\.body\.(\w+)|req\.body\[["'](\w+)["']\]/g;
// Destructured body
const DESTRUCTURED_BODY = /const\s*\{([^}]+)\}\s*=\s*req\.body/g;

// Python/Flask patterns
const FLASK_POST = /@\w+\.route\s*\(\s*["']([^"']+)["'][^)]*methods\s*=\s*\[.*?["']POST["']/g;

// Generic form data access
const FORM_DATA = /formData|FormData|form_data|request\.form/g;

export async function scanEndpoints(ctx: ScanContext): Promise<DataCollectionPoint[]> {
  const files = await walkFiles(ctx.repoPath, CODE_EXTENSIONS);
  const results: DataCollectionPoint[] = [];

  for (const file of files) {
    const content = await readFileContent(file);
    const fields: string[] = [];
    let hasPostEndpoint = false;
    let endpointPath = "";

    // Check for POST/PUT/PATCH endpoints
    EXPRESS_POST.lastIndex = 0;
    let match = EXPRESS_POST.exec(content);
    if (match) {
      hasPostEndpoint = true;
      endpointPath = match[2];
    }

    FLASK_POST.lastIndex = 0;
    match = FLASK_POST.exec(content);
    if (match) {
      hasPostEndpoint = true;
      endpointPath = match[1];
    }

    if (!hasPostEndpoint) continue;

    // Extract field names from req.body access
    REQ_BODY.lastIndex = 0;
    while ((match = REQ_BODY.exec(content)) !== null) {
      const field = match[1] || match[2];
      if (field) fields.push(field);
    }

    // Extract destructured body fields
    DESTRUCTURED_BODY.lastIndex = 0;
    while ((match = DESTRUCTURED_BODY.exec(content)) !== null) {
      const destructured = match[1].split(",").map(s => s.trim().split(":")[0].split("=")[0].trim());
      fields.push(...destructured.filter(f => f.length > 0));
    }

    const uniqueFields = [...new Set(fields)];

    results.push({
      type: "api-input",
      source: `POST ${endpointPath || "endpoint"}`,
      location: relativePath(ctx.repoPath, file),
      processor: "self-hosted",
      retention: "unknown",
      fields: uniqueFields.length > 0 ? uniqueFields : ["request_body"],
    });
  }

  return results;
}
