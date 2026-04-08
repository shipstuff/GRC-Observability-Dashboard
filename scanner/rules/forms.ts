import { ScanContext, DataCollectionPoint } from "../types.js";
import { walkFiles, readFileContent, relativePath } from "../utils.js";

const HTML_EXTENSIONS = new Set([
  ".html", ".htm", ".hbs", ".ejs", ".pug", ".njk", ".mustache",
  ".vue", ".svelte", ".tsx", ".jsx",
]);

const FORM_PATTERN = /<form[\s>]/gi;
const INPUT_PATTERN = /<input[^>]*(?:name|id)=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?/gi;
const INPUT_PATTERN_ALT = /<input[^>]*(?:type=["']([^"']+)["'])[^>]*(?:name|id)=["']([^"']+)["']/gi;
const TEXTAREA_PATTERN = /<textarea[^>]*(?:name|id)=["']([^"']+)["']/gi;
const SELECT_PATTERN = /<select[^>]*(?:name|id)=["']([^"']+)["']/gi;

function classifyField(name: string, type?: string): string {
  const lower = name.toLowerCase();
  if (type === "email" || lower.includes("email")) return "email";
  if (type === "password" || lower.includes("password")) return "password";
  if (type === "tel" || lower.includes("phone") || lower.includes("tel")) return "phone";
  if (lower.includes("name") || lower.includes("first") || lower.includes("last")) return "name";
  if (lower.includes("address") || lower.includes("street") || lower.includes("city") || lower.includes("zip")) return "address";
  if (lower.includes("username") || lower.includes("user")) return "username";
  if (lower.includes("message") || lower.includes("comment") || lower.includes("body")) return "message";
  if (lower.includes("dob") || lower.includes("birth") || lower.includes("age")) return "date_of_birth";
  if (lower.includes("ssn") || lower.includes("social")) return "ssn";
  if (lower.includes("card") || lower.includes("credit") || lower.includes("payment")) return "payment";
  return "other";
}

export async function scanForms(ctx: ScanContext): Promise<DataCollectionPoint[]> {
  const files = await walkFiles(ctx.repoPath, HTML_EXTENSIONS);
  const results: DataCollectionPoint[] = [];

  for (const file of files) {
    const content = await readFileContent(file);
    const formMatches = content.match(FORM_PATTERN);
    if (!formMatches) continue;

    const fields: string[] = [];
    const fieldTypes: Map<string, string> = new Map();

    for (const pattern of [INPUT_PATTERN, INPUT_PATTERN_ALT]) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        const name = pattern === INPUT_PATTERN ? match[1] : match[2];
        const type = pattern === INPUT_PATTERN ? match[2] : match[1];
        if (name && !["submit", "hidden", "csrf", "_token"].includes(name.toLowerCase())) {
          const classified = classifyField(name, type);
          fields.push(classified);
          fieldTypes.set(classified, type || "text");
        }
      }
    }

    for (const pattern of [TEXTAREA_PATTERN, SELECT_PATTERN]) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          fields.push(classifyField(match[1]));
        }
      }
    }

    if (fields.length > 0) {
      const uniqueFields = [...new Set(fields)];
      const hasEmail = uniqueFields.includes("email");

      results.push({
        type: hasEmail ? "contact-info" : "user-input",
        source: "web-form",
        location: relativePath(ctx.repoPath, file),
        processor: "self-hosted",
        retention: "unknown",
        fields: uniqueFields,
      });
    }
  }

  return results;
}
