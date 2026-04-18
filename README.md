# GRC Observability Dashboard

Automated compliance scanning for GitHub repos. Scans code for data collection, security issues, and governance gaps - then generates policies, risk assessments, and framework compliance reports. Results feed a central dashboard.

## What It Does

On every push or PR, the scanner produces:

| Output | Location | Description |
|--------|----------|-------------|
| `manifest.yml` | `.grc/` | Structured compliance data - single source of truth |
| `privacy-policy.md` | `docs/policies/` | GDPR + CCPA policy, populated from detected data collection |
| `terms-of-service.md` | `docs/policies/` | ToS with auto-detected service descriptions |
| `vulnerability-disclosure.md` | `docs/policies/` | Responsible disclosure policy |
| `incident-response-plan.md` | `docs/policies/` | NIST SP 800-61 based IRP |
| `security.txt` | `.well-known/` | RFC 9116 security contact file |
| `risk-assessment.md` | `.grc/` | Likelihood x impact matrix with framework mappings |
| `nist-csf-report.md` | `.grc/` | 18 NIST CSF controls with SOC 2 + ISO 27001 cross-mapping |
| `security-headers-report.md` | `.grc/` | Header status + copy-paste fix |
| `access-controls-report.md` | `.grc/` | Branch protection and auth findings |

Reports (`.grc/`) are gitignored and regenerated each scan. Policies (`docs/policies/`, `.well-known/`) are committed to your PR branch so they ship with your code.

## Setup

### 1. Deploy the Dashboard

```bash
git clone https://github.com/YOUR_ORG/GRC-Observability-Dashboard.git
cd GRC-Observability-Dashboard
npm install

# Login to Cloudflare
npx wrangler login

# Create KV storage
npx wrangler kv namespace create GRC_KV
# Copy the ID from the output

# Edit wrangler.toml - paste the KV namespace ID
# Optionally set ORG_NAME in [vars]

# Run locally
npx wrangler dev

# Or deploy to Cloudflare
npx wrangler deploy
```

**Authentication.** The dashboard verifies incoming manifest POSTs against GitHub's OIDC provider — no shared secret to configure. Consumer workflows mint a short-lived JWT that the dashboard validates against GitHub's public JWKS, and the token's `repository` claim must match the manifest's `repo` field. Fork deployers optionally set `GRC_AUDIENCE` in `[vars]` on `wrangler.toml` to scope tokens to their deployment (defaults to `grc-dashboard`).

For local development with `wrangler dev`, set `GRC_AUTH_BYPASS=1` in your local `.dev.vars` to skip verification while you iterate; never set this in production.

### 2. Add the Action to Your Repos

Create `.github/workflows/grc-scan.yml`:

```yaml
name: GRC Compliance Scan

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: write          # required for auto-committing generated policies to PR branch
  pull-requests: write
  id-token: write          # required to mint the OIDC JWT the dashboard uses for auth

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: YOUR_ORG/GRC-Observability-Dashboard@main
        with:
          site_url: https://yoursite.com
          dashboard_url: https://your-dashboard.workers.dev
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

If you prefer the action not commit anything, replace `contents: write` with `contents: read`. The scan still runs and the dashboard still updates — generated policies just won't auto-commit.

`id-token: write` is the only required change from the pre-auth workflow shape. The scanner uses GitHub's OIDC provider to mint a short-lived JWT so the dashboard can verify the request came from this specific repository. There are no shared secrets to manage on the consumer side.

If you are pointing the action at a fork of this dashboard that sets a custom `GRC_AUDIENCE` in its `wrangler.toml`, also pass the matching `audience` input so the JWT is minted against that audience:

```yaml
- uses: YOUR_ORG/GRC-Observability-Dashboard@main
  with:
    dashboard_url: https://your-fork-dashboard.workers.dev
    audience: your-fork-audience      # must match GRC_AUDIENCE on the dashboard
    site_url: https://yoursite.com
```

When pointing at the upstream dashboard, leave `audience` unset — it defaults to `grc-dashboard`.

### 3. Add Site Config

Create `.grc/config.yml` in each repo:

```yaml
site_name: Your Site
site_url: https://yoursite.com
owner_name: Your Name
contact_email: you@example.com
log_retention_days: 90
jurisdiction:
  - gdpr
  - ccpa

# Optional: where to write generated policies in your repo (default: docs/policies)
# output_dir: docs/policies

# Optional: where your site serves each policy (enables dashboard's Check Production URL verification)
# policy_urls:
#   privacy_policy: /privacy-policy
#   terms_of_service: /legal/terms
#   vulnerability_disclosure: /vulnerability-disclosure
#   security_txt: /.well-known/security.txt
```

### 4. Update .gitignore

```
# Regenerated each scan, never commit
.grc/*
!.grc/config.yml
```

Policies live at `docs/policies/` and `.well-known/security.txt` - those DO get committed (via the action).

## Dashboard

The dashboard shows compliance posture across all your repos:

- Org-wide stats (compliance %, NIST CSF %, vulnerabilities, secrets)
- Per-repo detail with data collection, headers, TLS, deps, access controls, artifacts
- NIST CSF tab with per-function scores and SOC 2 / ISO 27001 cross-references
- **AI tab** with detected AI systems (provider, SDK, category), risk tier, and data flows
- Branch dropdown to compare compliance across branches
- Search/filter by repo name
- Trend tracking over time (last 500 scans per repo)
- **"Check Production" button** - hits your live URL on demand, verifies security headers, HTTPS enforcement, and any URLs configured in `policy_urls`

### Dashboard API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/report` | POST | Receive a manifest (YAML or JSON) |
| `/api/repos` | GET | All repo summaries |
| `/api/repos/:owner/:name` | GET | Full manifest for a repo |
| `/api/history/:owner/:name` | GET | Historical scan data |
| `/api/branches/:owner/:name` | GET | List of branches scanned for a repo |
| `/api/check-production/:owner/:name` | POST | Re-check live URL (headers, HTTPS, policy URLs) |
| `/health` | GET | Service health probe |
| `/badge?repo=:owner/:name` | GET | SVG badge for a repo |
| `/badge/:owner/:name` | GET | Path-style SVG badge for a repo |

### Badge

Any scanned repo can expose a public status badge from the deployed worker.

Markdown image:

```md
![GRC observability](https://grc-dashboard.jdeftekhari.workers.dev/badge?repo=shipstuff/GRC-Observability-Dashboard)
```

Linked badge:

```md
[![GRC observability](https://grc-dashboard.jdeftekhari.workers.dev/badge?repo=shipstuff/GRC-Observability-Dashboard)](https://grc-dashboard.jdeftekhari.workers.dev/repo/shipstuff/GRC-Observability-Dashboard)
```

Branch-specific badge:

```md
![GRC observability](https://grc-dashboard.jdeftekhari.workers.dev/badge/shipstuff/GRC-Observability-Dashboard?branch=main)
```

Badge states:

- `pass NN%` — no critical findings and overall posture is healthy
- `warn NN%` — medium-risk posture, missing controls, or high vulnerabilities
- `fail NN%` — critical vulnerabilities, detected secrets, or very low compliance
- `not scanned` — the dashboard has no manifest for that repo/branch yet

GitHub's GitHub App badge UI is a separate static logo upload. See [docs/github-app-badge.md](docs/github-app-badge.md) for the distinction and setup steps.

## Scanner

Run the scanner locally without the dashboard:

```bash
npm run scan -- /path/to/repo --url=https://yoursite.com
```

Reports are written to `/path/to/repo/.grc/`. Policies are written to `/path/to/repo/docs/policies/` and `/path/to/repo/.well-known/security.txt`.

### What It Scans

- **Forms** - HTML forms, input fields, PII classification
- **Endpoints** - POST/PUT/PATCH route handlers, req.body fields
- **Dependencies** - `package.json` against 20+ known services (Resend, Stripe, Sentry, Auth0, etc.), `npm audit` for CVEs
- **Cookies** - server and client cookie usage
- **Tracking** - Google Analytics, Mixpanel, PostHog, Hotjar, Facebook Pixel, etc.
- **Secrets** - API keys, tokens, private keys in source
- **Access Controls** - GitHub **Rulesets API** for branch protection details (required reviewers, signed commits, rule types), auth middleware on sensitive routes
- **Artifacts** - existence of policies, security.txt, IRP at configured `output_dir`
- **Security Headers** - CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (live URL check)
- **TLS** - HTTPS enforcement, certificate expiry (live URL check)
- **AI Systems** - detects AI SDKs (OpenAI, Anthropic, Cohere, Gemini, HuggingFace, Mistral, Groq, LangChain, LlamaIndex, Vercel AI SDK), training libs (TensorFlow, PyTorch), vector DBs (Pinecone, Weaviate, ChromaDB, Qdrant), and outbound API calls. Supports Node (`package.json`), Python (`requirements.txt`, `pyproject.toml`), and monorepos.

## AI Enhancements (Optional)

Add to `.grc/config.yml`:

```yaml
ai:
  enabled: true
  provider: anthropic  # or openai
```

Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as an environment variable or GitHub secret. The scanner works fully without AI.

AI is used for: PII classification of form fields, plain-English risk narratives, PR comment summaries, and gap analysis recommendations.

## Architecture

```
GRC-Observability-Dashboard/
  action.yml                 # Composite GitHub Action
  wrangler.toml              # Cloudflare Worker config
  dashboard/
    worker.ts                # Hono API + HTMX UI (Cloudflare Worker)
    views/render.ts          # Dashboard templates
  scanner/
    index.ts                 # Scanner entry point
    rules/                   # Detection rules
    generators/              # Report generators
    frameworks/              # NIST CSF + SOC 2 + ISO 27001 cross-mappings
    templates/               # Handlebars policy templates
    ai/                      # Optional AI enhancement layer
  examples/
    grc-scan.yml             # Example workflow for consuming repos
  docs/                      # Architecture and reference docs

Your repo/
  .github/workflows/grc-scan.yml   # ~15 lines
  .grc/config.yml                  # site info + optional policy URLs
  docs/policies/                   # auto-generated, committed by the action
  .well-known/security.txt         # auto-generated, committed by the action
```

## Configuration

### `.grc/config.yml`

| Field | Required | Description |
|-------|----------|-------------|
| `site_name` | yes | Display name used in generated policies |
| `site_url` | yes | Your site's canonical URL |
| `owner_name` | yes | Site owner name |
| `contact_email` | yes | Contact for privacy/legal inquiries |
| `security_contact` | no | Contact for security reports (defaults to `contact_email`) |
| `log_retention_days` | no | Server log retention period (default: 90) |
| `jurisdiction` | no | `gdpr`, `ccpa`, etc. (default: `[gdpr, ccpa]`) |
| `output_dir` | no | Where to write policy files (default: `docs/policies`) |
| `policy_urls` | no | URLs at which your site serves each policy (enables Check Production URL verification) |
| `ai.enabled` | no | Opt in to AI enhancements (default: `false`) |
| `ai.provider` | no | `anthropic` or `openai` (default: `anthropic`) |

### `wrangler.toml`

| Setting | Description |
|---------|-------------|
| `name` | Worker name (used in URL: `name.your-account.workers.dev`) |
| `ORG_NAME` | Displayed in dashboard header (optional, set in `[vars]`) |
| KV namespace `id` | Your KV storage ID (from `npx wrangler kv namespace create GRC_KV`) |

### Action Inputs

| Input | Description | Required |
|-------|-------------|----------|
| `site_url` | Live URL for the Check Production button | No |
| `dashboard_url` | Dashboard URL to POST manifests to | No |

## Future

- **AI Compliance Layer** (next up): EU AI Act detection and risk tiering, AI system inventory, auto-generated model cards and FRIAs, dashboard AI compliance tab
- GitHub App (zero-config install, no workflow file needed per repo)
- SBOM generation (CycloneDX)
- SAST via Semgrep integration
- Auditor evidence export (PDF/ZIP per framework)
- Dashboard authentication

## Roadmap

See [docs/implementation-checklist.md](docs/implementation-checklist.md).
