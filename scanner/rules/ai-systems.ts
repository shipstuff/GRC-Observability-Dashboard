import { ScanContext, AISystem } from "../types.js";
import { walkFiles, readFileContent, relativePath, fileExists } from "../utils.js";
import { join } from "node:path";

interface KnownAI {
  provider: string;
  category: AISystem["category"];
}

const KNOWN_AI_PACKAGES: Record<string, KnownAI> = {
  // Inference SDKs
  "openai": { provider: "OpenAI", category: "inference" },
  "@anthropic-ai/sdk": { provider: "Anthropic", category: "inference" },
  "cohere-ai": { provider: "Cohere", category: "inference" },
  "@google/generative-ai": { provider: "Google Gemini", category: "inference" },
  "@google-cloud/aiplatform": { provider: "Google Vertex AI", category: "inference" },
  "@huggingface/inference": { provider: "Hugging Face", category: "inference" },
  "@mistralai/mistralai": { provider: "Mistral", category: "inference" },
  "groq-sdk": { provider: "Groq", category: "inference" },
  "together-ai": { provider: "Together AI", category: "inference" },
  "replicate": { provider: "Replicate", category: "inference" },

  // Frameworks
  "langchain": { provider: "LangChain", category: "framework" },
  "@langchain/core": { provider: "LangChain", category: "framework" },
  "@langchain/openai": { provider: "LangChain + OpenAI", category: "framework" },
  "@langchain/anthropic": { provider: "LangChain + Anthropic", category: "framework" },
  "llamaindex": { provider: "LlamaIndex", category: "framework" },
  "ai": { provider: "Vercel AI SDK", category: "framework" },
  "@ai-sdk/openai": { provider: "Vercel AI SDK + OpenAI", category: "framework" },
  "@ai-sdk/anthropic": { provider: "Vercel AI SDK + Anthropic", category: "framework" },

  // Self-hosted inference
  "ollama": { provider: "Ollama (self-hosted)", category: "self-hosted" },
  "@ollama/ollama": { provider: "Ollama (self-hosted)", category: "self-hosted" },

  // Training / ML
  "@tensorflow/tfjs": { provider: "TensorFlow.js", category: "training" },
  "onnxruntime-node": { provider: "ONNX Runtime", category: "training" },

  // Vector databases (signal RAG pipelines)
  "@pinecone-database/pinecone": { provider: "Pinecone", category: "vector-db" },
  "weaviate-ts-client": { provider: "Weaviate", category: "vector-db" },
  "chromadb": { provider: "ChromaDB", category: "vector-db" },
  "@qdrant/js-client-rest": { provider: "Qdrant", category: "vector-db" },
  "@upstash/vector": { provider: "Upstash Vector", category: "vector-db" },
  "@supabase/supabase-js": { provider: "Supabase (possible pgvector)", category: "vector-db" },
};

// Outbound API call patterns to detect AI usage even without SDK imports
const AI_API_PATTERNS = [
  { pattern: /api\.openai\.com/g, provider: "OpenAI", category: "inference" as const },
  { pattern: /api\.anthropic\.com/g, provider: "Anthropic", category: "inference" as const },
  { pattern: /api\.cohere\.ai/g, provider: "Cohere", category: "inference" as const },
  { pattern: /generativelanguage\.googleapis\.com/g, provider: "Google Gemini", category: "inference" as const },
  { pattern: /api\.mistral\.ai/g, provider: "Mistral", category: "inference" as const },
  { pattern: /api\.groq\.com/g, provider: "Groq", category: "inference" as const },
  { pattern: /api\.together\.xyz/g, provider: "Together AI", category: "inference" as const },
  { pattern: /api\.replicate\.com/g, provider: "Replicate", category: "inference" as const },
];

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".java", ".php",
]);

export async function scanAISystems(ctx: ScanContext): Promise<AISystem[]> {
  const systems: AISystem[] = [];
  const seen = new Set<string>();

  // 1. Check ALL package.json files for known AI packages (supports monorepos)
  const pkgFiles = await walkFiles(ctx.repoPath, new Set([".json"]));
  const packageJsons = pkgFiles.filter(f => f.endsWith("package.json"));

  for (const pkgPath of packageJsons) {
    const content = await readFileContent(pkgPath);
    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const rel = relativePath(ctx.repoPath, pkgPath);

      for (const [depName, _version] of Object.entries(allDeps)) {
        const known = KNOWN_AI_PACKAGES[depName];
        if (known && !seen.has(known.provider)) {
          seen.add(known.provider);
          systems.push({
            provider: known.provider,
            sdk: depName,
            location: rel,
            category: known.category,
            dataFlows: [],
          });
        }
      }
    } catch {
      // Malformed package.json
    }
  }

  // 2. Check requirements.txt / pyproject.toml for Python AI packages
  const pyPackages: Record<string, KnownAI> = {
    "openai": { provider: "OpenAI", category: "inference" },
    "anthropic": { provider: "Anthropic", category: "inference" },
    "cohere": { provider: "Cohere", category: "inference" },
    "google-generativeai": { provider: "Google Gemini", category: "inference" },
    "huggingface-hub": { provider: "Hugging Face", category: "inference" },
    "langchain": { provider: "LangChain", category: "framework" },
    "llama-index": { provider: "LlamaIndex", category: "framework" },
    "transformers": { provider: "Hugging Face Transformers", category: "self-hosted" },
    "torch": { provider: "PyTorch", category: "training" },
    "tensorflow": { provider: "TensorFlow", category: "training" },
    "scikit-learn": { provider: "scikit-learn", category: "training" },
    "sklearn": { provider: "scikit-learn", category: "training" },
    "pinecone-client": { provider: "Pinecone", category: "vector-db" },
    "chromadb": { provider: "ChromaDB", category: "vector-db" },
    "weaviate-client": { provider: "Weaviate", category: "vector-db" },
    "qdrant-client": { provider: "Qdrant", category: "vector-db" },
    "ollama": { provider: "Ollama (self-hosted)", category: "self-hosted" },
    "vllm": { provider: "vLLM (self-hosted)", category: "self-hosted" },
    "ctransformers": { provider: "CTransformers (self-hosted)", category: "self-hosted" },
  };

  // Check requirements*.txt files
  for (const reqFile of ["requirements.txt", "requirements-dev.txt"]) {
    const reqPath = join(ctx.repoPath, reqFile);
    if (await fileExists(reqPath)) {
      const content = await readFileContent(reqPath);
      for (const line of content.split("\n")) {
        const pkgName = line.trim().split(/[=<>!~\[]/)[0].trim().toLowerCase();
        const known = pyPackages[pkgName];
        if (known && !seen.has(known.provider)) {
          seen.add(known.provider);
          systems.push({
            provider: known.provider,
            sdk: pkgName,
            location: reqFile,
            category: known.category,
            dataFlows: [],
          });
        }
      }
    }
  }

  // Check pyproject.toml (Poetry, PDM, uv, Hatch, etc.)
  const pyprojectPath = join(ctx.repoPath, "pyproject.toml");
  if (await fileExists(pyprojectPath)) {
    const content = await readFileContent(pyprojectPath);
    // Match dependency lines in [project.dependencies], [tool.poetry.dependencies], etc.
    // TOML arrays look like: "openai>=1.0" or 'langchain = "^0.1"'
    for (const [pkgName, known] of Object.entries(pyPackages)) {
      // Match the package name at a word boundary in the TOML content
      const pattern = new RegExp(`(?:^|[\\s"'=,])${pkgName.replace("-", "[-_]")}(?:[\\s"'=<>!~,\\[\\]]|$)`, "mi");
      if (pattern.test(content) && !seen.has(known.provider)) {
        seen.add(known.provider);
        systems.push({
          provider: known.provider,
          sdk: pkgName,
          location: "pyproject.toml",
          category: known.category,
          dataFlows: [],
        });
      }
    }
  }

  // 3. Scan code for outbound AI API calls (catches usage without SDK imports)
  const files = await walkFiles(ctx.repoPath, CODE_EXTENSIONS);
  for (const file of files) {
    const content = await readFileContent(file);
    for (const { pattern, provider, category } of AI_API_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content) && !seen.has(`api:${provider}`)) {
        seen.add(`api:${provider}`);
        // Only add if we didn't already find this provider via package.json
        if (!seen.has(provider)) {
          systems.push({
            provider,
            sdk: "direct API call",
            location: relativePath(ctx.repoPath, file),
            category,
            dataFlows: [],
          });
        }
      }
    }
  }

  return systems;
}
