# Manifest Specification

The manifest is the structured output of every scan and the single source of truth for both generated policies and the dashboard. It's a YAML file written to `.grc/manifest.yml` and POSTed to the dashboard on every successful scan.

## Authoritative schema

[`scanner/types.ts`](../scanner/types.ts) is the authoritative schema. The `Manifest` interface in that file defines every field; any doc that duplicates it will drift.

The key top-level fields as of this writing:

- `repo`, `scanDate`, `branch`, `commit` — identification
- `dataCollection[]` — forms, endpoints, cookies, tracking
- `thirdPartyServices[]` — detected third-party data processors with optional DPA URLs
- `securityHeaders`, `https`, `dependencies` — live-check results (nullable; only populated when a site URL is configured)
- `secretsScan`, `accessControls`, `artifacts` — static-scan results always populated
- `aiSystems[]` — detected AI SDKs, frameworks, vector DBs, or outbound AI API calls, each with a risk tier (Phase 8)
- `policyUrls?` — user-declared URLs for each generated policy on the live site (opt-in)

## Format conventions

- **camelCase keys** in both YAML and JSON (matching the TypeScript interface exactly — no snake_case translation).
- **Optional fields use `undefined` semantics**: absent key means "not scanned" or "not applicable", not "missing".
- **Live-check fields are nullable**: `securityHeaders`, `https`, `dependencies` are `null` when no site URL is configured or when the live fetch failed.

## Flow

```
scanner/index.ts scan pipeline:
  1. Parallel scan rules populate findings
  2. Policy templates render against the manifest
  3. Policy files written to output_dir; artifacts rescanned
  4. Framework evaluation (NIST CSF, EU AI Act)
  5. Manifest written to .grc/manifest.yml — last
  6. Action POSTs the file to the dashboard
```

The scanner writes the manifest *last* so it reflects the real filesystem state after policy generation — not a pre-generation snapshot. This matters for the `artifacts` field specifically: it's set from the actual files on disk after rendering, so it correctly reports `"generated"` rather than `"missing"`.

## Idempotency

Two consecutive scans against an unchanged repo must produce byte-identical manifests (and byte-identical generated policies). The scanner enforces this by:

- Excluding `scanDate` from template bodies (git history records timing).
- Pinning `security.txt` `Expires` to Jan 1 of the next year rather than a rolling expiry.
- Never including the commit hash inside policy bodies.

If you're extending the scanner and a field introduces non-determinism, add a test fixture to `scripts/smoke-dashboard.ts` that would catch the regression, or add a real Vitest unit test.
