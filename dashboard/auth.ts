/**
 * GitHub OIDC JWT verification for Cloudflare Workers.
 *
 * Consuming workflows mint a short-lived RS256 JWT from GitHub's OIDC
 * endpoint and send it as `Authorization: Bearer <jwt>`. This module
 * fetches GitHub's JWKS, verifies the signature, validates the standard
 * claims, and returns the parsed payload so the caller can check
 * `repository` against the incoming manifest.
 *
 * No external dependencies — uses the Web Crypto API native to Workers.
 */

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const DEFAULT_AUDIENCE = "grc-dashboard";
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface JwkKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
  x5c?: string[];
  x5t?: string;
}

interface Jwks {
  keys: JwkKey[];
}

/**
 * Standard GitHub OIDC claims. Lots more exist (workflow_ref, job_workflow_ref,
 * ref, event_name, …) — we only type the ones we actually read.
 */
export interface GitHubOidcClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat: number;
  nbf?: number;
  repository: string;
  repository_owner?: string;
  ref?: string;
  ref_type?: string;
  workflow_ref?: string;
  run_id?: string;
  [key: string]: unknown;
}

// In-memory JWKS cache. Worker instances are short-lived but reused across
// requests while warm, so this meaningfully reduces JWKS fetches. When the
// worker is evicted the cache resets — fine.
let jwksCache: { jwks: Jwks; fetchedAt: number } | null = null;

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function base64urlDecodeToBytes(input: string): Uint8Array {
  // Convert base64url → base64
  let padded = input.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64urlDecodeToBytes(input));
}

async function fetchJwks(force = false): Promise<Jwks> {
  const now = Date.now();
  if (!force && jwksCache && (now - jwksCache.fetchedAt) < JWKS_CACHE_TTL_MS) {
    return jwksCache.jwks;
  }
  const resp = await fetch(GITHUB_JWKS_URL, { cf: { cacheTtl: 600 } as any });
  if (!resp.ok) {
    throw new AuthError(502, `Failed to fetch GitHub JWKS (${resp.status})`);
  }
  const jwks = await resp.json() as Jwks;
  if (!Array.isArray(jwks.keys)) {
    throw new AuthError(502, "Malformed GitHub JWKS response");
  }
  jwksCache = { jwks, fetchedAt: now };
  return jwks;
}

async function importRsaPublicKey(jwk: JwkKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig", ext: true } as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Verify a GitHub OIDC JWT and return its claims. Throws AuthError on any
 * validation failure — callers should catch and map to HTTP 401.
 */
export async function verifyGitHubOidc(
  authHeader: string | undefined,
  audience: string = DEFAULT_AUDIENCE,
): Promise<GitHubOidcClaims> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new AuthError(401, "Missing or malformed Authorization header");
  }
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError(401, "Invalid JWT format");

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  let header: { alg: string; kid?: string; typ?: string };
  let payload: GitHubOidcClaims;
  try {
    header = JSON.parse(base64urlDecodeToString(headerB64));
    payload = JSON.parse(base64urlDecodeToString(payloadB64)) as GitHubOidcClaims;
  } catch {
    throw new AuthError(401, "Failed to parse JWT");
  }

  if (header.alg !== "RS256") {
    throw new AuthError(401, `Unsupported JWT algorithm: ${header.alg}`);
  }
  if (!header.kid) throw new AuthError(401, "JWT header missing kid");

  // Look up the signing key. If the kid isn't in our cached JWKS, force a
  // refresh once — GitHub rotates keys and we don't want to reject a valid
  // token just because our cache is stale.
  let jwks = await fetchJwks(false);
  let jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) {
    jwks = await fetchJwks(true);
    jwk = jwks.keys.find(k => k.kid === header.kid);
  }
  if (!jwk) throw new AuthError(401, `No JWKS entry for kid ${header.kid}`);

  const key = await importRsaPublicKey(jwk);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = base64urlDecodeToBytes(signatureB64);
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    sig,
    data,
  );
  if (!valid) throw new AuthError(401, "JWT signature verification failed");

  // Standard claim checks
  if (payload.iss !== GITHUB_OIDC_ISSUER) {
    throw new AuthError(401, `Unexpected issuer: ${payload.iss}`);
  }
  const audClaim = payload.aud;
  const audOk = Array.isArray(audClaim) ? audClaim.includes(audience) : audClaim === audience;
  if (!audOk) {
    throw new AuthError(401, `Audience mismatch (expected "${audience}")`);
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new AuthError(401, "JWT expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) {
    throw new AuthError(401, "JWT not yet valid");
  }
  if (typeof payload.repository !== "string" || payload.repository.length === 0) {
    throw new AuthError(401, "JWT missing repository claim");
  }

  return payload;
}

/**
 * Assert that a verified JWT was minted for a specific repository. Used to
 * prevent repo A from POSTing manifests claiming to be repo B even if both
 * hold valid tokens.
 */
export function assertRepositoryMatches(claims: GitHubOidcClaims, expectedRepo: string): void {
  if (claims.repository.toLowerCase() !== expectedRepo.toLowerCase()) {
    throw new AuthError(
      403,
      `Token repository "${claims.repository}" does not match target repo "${expectedRepo}"`,
    );
  }
}

export { DEFAULT_AUDIENCE };
