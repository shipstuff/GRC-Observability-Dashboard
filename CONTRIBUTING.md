# Contributing

Thanks for looking at the GRC Observability Dashboard. This guide covers the dev loop and the three most common extension points: adding a scan rule, adding a policy template, and adding a framework.

If you're new to the codebase, start with `CLAUDE.md` for a one-page architecture overview, then `docs/implementation-checklist.md` for what's shipped and what's next.

---

## Dev loop

```bash
# Clone and install
git clone https://github.com/YOUR_FORK/GRC-Observability-Dashboard.git
cd GRC-Observability-Dashboard
npm install
```

### Running the scanner

The scanner is a Node CLI that scans a repo (defaults to the current directory) and writes a manifest + reports to `.grc/`.

```bash
# Scan this repo
npm run scan -- .

# Scan another repo
npm run scan -- /path/to/some/repo --url=https://that-site.com
```

After a scan, look at:

- `.grc/manifest.yml` — the canonical output. What the dashboard stores.
- `.grc/nist-csf-report.md` / `.grc/ai-compliance-report.md` / `.grc/risk-assessment.md` — human-readable reports.
- `docs/policies/*.md` + `.well-known/security.txt` — generated policies committed to the consuming repo.

### Running the dashboard locally

```bash
# Boot miniflare-backed wrangler with an in-memory KV
npx wrangler dev --local

# Open http://localhost:8787
```

For local iteration you'll usually want to skip OIDC verification on manifest POSTs. Create `.dev.vars` (gitignored) at the repo root:

```
GRC_AUTH_BYPASS=1
```

Then POST a manifest from another scan into the local dashboard:

```bash
curl -X POST -H "Content-Type: text/yaml" \
  --data-binary @.grc/manifest.yml \
  "http://localhost:8787/api/report?site_url=https://example.com"
```

### CI

Every PR runs `.github/workflows/ci.yml`:

1. `npm ci`
2. Scanner smoke: `npm run scan -- .` against this repo.
3. Dashboard smoke: `npx tsx scripts/smoke-dashboard.ts` — exercises every render function with two manifest fixtures (new-shape and pre-Phase-8-shape).

If you're making a render or summarize change, extend `scripts/smoke-dashboard.ts` to cover the new path.

---

## Adding a scan rule

A scan rule is a function that inspects the repo tree (or the scan context) and returns structured findings for the manifest.

### 1. Write the rule

Rules live in `scanner/rules/*.ts`. Each exports a single async function taking a `ScanContext` and returning whatever shape the manifest expects for that finding.

```ts
// scanner/rules/my-rule.ts
import type { ScanContext } from "../types.js";
import { walkFiles, readFileContent } from "../utils.js";

export async function scanMyThing(ctx: ScanContext): Promise<MyFindings> {
  const files = await walkFiles(ctx.repoPath);
  // ...inspect files, return findings
  return { detected: false, findings: [] };
}
```

Use `walkFiles` / `readFileContent` / `fileExists` from `scanner/utils.ts` for I/O. They honor `SKIP_DIRS` so you don't accidentally walk `node_modules/` or `.grc/`.

### 2. Add the finding type to the manifest

`scanner/types.ts` defines the manifest schema. Add an interface for your finding and a field on `Manifest`. Keep the field optional if you want older scanners' output to still parse (the 2026-04-18 outage was a failure to do this).

### 3. Wire the rule into the scan pipeline

`scanner/index.ts` runs most rules in parallel inside `Promise.all`. Add your rule alongside the others, then include its result in the manifest.

### 4. Cover it in smoke tests

Add a minimal fixture to `scripts/smoke-dashboard.ts` so any future regression in the rule's output shape fails CI.

### 5. Surface it on the dashboard (optional)

If the finding deserves a UI row, extend `dashboard/views/render.ts` — usually `renderRepoDetail` or a new tab.

---

## Adding a policy template

Policies are Handlebars templates that render to markdown files and commit to the consuming repo's `docs/policies/` (or wherever `output_dir` points).

### 1. Add the template

Create `scanner/templates/my-policy.hbs`. Use helpers already registered in `scanner/render.ts`: `eq`, `hasGdpr`, `hasCcpa`, `joinFields`, `nextSection`. Add new helpers to the same file if you need them — they register on import.

### 2. Add the render function

In `scanner/render.ts`:

```ts
export async function renderMyPolicy(ctx: RenderContext): Promise<string> {
  const templatePath = join(getTemplateDir(), "my-policy.hbs");
  const templateSource = await readFileContent(templatePath);
  const template = Handlebars.compile(templateSource);
  return template({
    config: ctx.config,
    scanDate: formatScanDate(ctx.manifest.scanDate),
    branch: ctx.manifest.branch,
    commit: ctx.manifest.commit,
    // ... any template-specific data
  });
}
```

### 3. Wire it into the scan pipeline

`scanner/index.ts` renders policies inside `main()` after `scan()` returns. Add your renderer alongside the others, write the output to `policiesDir/<filename>.md`, and log the path.

### 4. Extend `ArtifactStatus` and `scanArtifacts`

`scanner/types.ts` → add a field to `ArtifactStatus` for your policy (use `"present" | "missing" | "not-applicable"` or `"generated" | "manual" | "missing"` depending on semantics).

`scanner/rules/artifacts.ts` → check for your file and set the state.

### 5. Credit the artifact in framework checks

If the policy satisfies a specific framework control (like an EU AI Act article or a NIST CSF control), update the relevant check in `scanner/frameworks/*.ts` so presence of the file flips the check from `fail` → `partial` or `pass`.

### 6. Keep it idempotent

Scans run on every push and PR. The policy output MUST be byte-identical across scans with unchanged inputs, or every scan will produce a noisy commit. Two rules:

- No scan date in the body (git history already records when).
- No commit hash in the body (same reason).

The bottom of each template has `Policy generated: {{scanDate}} — Branch: {{branch}} ({{commit}})` — that's intentionally the ONLY non-idempotent line.

---

## Adding a framework

Frameworks map scan findings to external compliance standards (NIST CSF, EU AI Act, SOC 2, etc.).

### 1. Define the controls

Create `scanner/frameworks/my-framework.ts`. Each control is a value with:

- `id` — framework-specific identifier
- `function` / `phase` / category — grouping field
- `description`
- `check(manifest)` — returns `"pass" | "partial" | "fail" | "not-applicable"`
- `evidence(manifest)` — human-readable reasoning string

Look at `scanner/frameworks/eu-ai-act.ts` for a 13-control example and `scanner/frameworks/nist-csf.ts` for the 18-control NIST reference.

### 2. Add cross-references

`scanner/frameworks/cross-map.ts` stores mappings to other frameworks (SOC 2, ISO 27001, NIST AI RMF, ISO/IEC 42001). Extend the array for any cross-refs your framework has.

### 3. Generate a report

Copy `scanner/generators/framework-report.ts` as a starting point. Output goes to `.grc/<framework>-report.md`. Follow the same markdown structure (score, per-category breakdown, details per control, cross-reference tables, methodology, caveat).

### 4. Surface on the dashboard

Extend `dashboard/worker.ts` with a score computation (`calc<Framework>Score`) and a per-category score helper. Add a new tab in `dashboard/views/render.ts` (mirroring the NIST CSF tab in `renderNistView`).

### 5. Add to the stats row (optional)

If the framework score belongs on the top of the dashboard, extend `renderDashboard`'s stats row.

### 6. Don't overclaim coverage

A framework mapping that covers 18 of NIST CSF 2.0's ~100 subcategories is not "NIST CSF compliant" — it's "75% of our 18 controls". Be explicit about partial coverage in the report methodology.

---

## Local-only things the scanner doesn't check for you

- **Shell scripts:** no shellcheck run. Run it manually if you touch `action.yml` or deploy workflows.
- **Handlebars template syntax:** templates compile lazily inside render functions. A typo only surfaces at scan time. Smoke-test locally with `npm run scan -- .` before pushing.
- **Wrangler config:** if you edit `wrangler.toml`, boot `npx wrangler dev --local` to confirm it parses.

---

## Submitting changes

Feature branches + PRs. The repo's `main` is protected — there's no direct push.

- Keep commits coherent; one concept per commit where feasible.
- Follow the existing commit message shape: a one-line subject, blank line, body explaining the "why" with enough context to remain useful in six months.
- Update `docs/implementation-checklist.md` when you check off or add items.
- CI must be green before merge.

---

## Getting help

Open a discussion or issue in the upstream repo. For questions about the architecture, start with `CLAUDE.md` — it's kept up to date with the current shape.
