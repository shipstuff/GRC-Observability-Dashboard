# GRC Observability Dashboard

Automated compliance scanning for GitHub repos. Scans code for data collection, security issues, and governance gaps - then generates policies, risk assessments, and framework compliance reports. Results feed a central dashboard.

## What It Does

On every push or PR, the scanner produces 10 compliance reports:

| Report | Description |
|--------|-------------|
| `manifest.yml` | Structured compliance data - single source of truth |
| `privacy-policy.md` | GDPR + CCPA policy, populated from detected data collection |
| `terms-of-service.md` | ToS with auto-detected service descriptions |
| `security.txt` | RFC 9116 security contact file |
| `vulnerability-disclosure.md` | Responsible disclosure policy |
| `incident-response-plan.md` | NIST SP 800-61 based IRP |
| `risk-assessment.md` | Likelihood x impact matrix with framework mappings |
| `nist-csf-report.md` | 18 NIST CSF controls with SOC 2 + ISO 27001 cross-mapping |
| `security-headers-report.md` | Header status + copy-paste fix |
| `access-controls-report.md` | Branch protection and auth findings |

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

### 2. Add the Action to Your Repos

Create `.github/workflows/grc-scan.yml`:

```yaml
name: GRC Compliance Scan

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write

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
```

### 4. Update .gitignore

```
.grc/*
!.grc/config.yml
```

## Dashboard

The dashboard shows compliance posture across all your repos:

- Org-wide stats (compliance %, NIST CSF %, vulnerabilities, secrets)
- Per-repo detail with data collection, headers, TLS, deps, access controls, artifacts
- NIST CSF tab with per-function scores and SOC 2 / ISO 27001 cross-references
- Branch dropdown to compare compliance across branches
- Trend tracking over time
- "Check Production" button to verify live security headers on demand

### Dashboard API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/report` | POST | Receive a manifest (YAML or JSON) |
| `/api/repos` | GET | All repo summaries |
| `/api/repos/:owner/:name` | GET | Full manifest for a repo |
| `/api/history/:owner/:name` | GET | Historical scan data |
| `/api/check-production/:owner/:name` | POST | Check live security headers |
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

GitHub’s GitHub App badge UI is a separate static logo upload. See [docs/github-app-badge.md](docs/github-app-badge.md) for the distinction and setup steps.

## Scanner

Run the scanner locally without the dashboard:

```bash
npm run scan -- /path/to/repo --url=https://yoursite.com
```

Reports are written to `/path/to/repo/.grc/`.

### What It Scans

- **Forms** - HTML forms, input fields, PII classification
- **Endpoints** - POST/PUT/PATCH route handlers, req.body fields
- **Dependencies** - package.json against 20+ known services, npm audit for CVEs
- **Cookies** - server and client cookie usage
- **Tracking** - Google Analytics, Mixpanel, PostHog, etc.
- **Secrets** - API keys, tokens, private keys in source
- **Access Controls** - GitHub branch protection, auth middleware on routes
- **Artifacts** - existing policies, security.txt, IRP
- **Security Headers** - CSP, HSTS, X-Frame-Options, etc. (live URL check)
- **TLS** - HTTPS enforcement, certificate expiry (live URL check)

## AI Enhancements (Optional)

Add to `.grc/config.yml`:

```yaml
ai:
  enabled: true
  provider: anthropic  # or openai
```

Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` as an environment variable or GitHub secret. The scanner works fully without AI.

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
    frameworks/              # NIST CSF + cross-mappings
    templates/               # Handlebars policy templates
    ai/                      # Optional AI enhancement layer
  examples/
    grc-scan.yml             # Example workflow for consuming repos
  docs/                      # Architecture and reference docs

Your repo/
  .github/workflows/grc-scan.yml   # ~15 lines
  .grc/config.yml                  # ~7 lines
```

## Configuration

### wrangler.toml

| Setting | Description |
|---------|-------------|
| `name` | Worker name (used in URL: `name.your-account.workers.dev`) |
| `ORG_NAME` | Displayed in dashboard header (optional, set in `[vars]`) |
| KV namespace `id` | Your KV storage ID (from `npx wrangler kv namespace create GRC_KV`) |

### Action Inputs

| Input | Description | Required |
|-------|-------------|----------|
| `site_url` | Live URL for the "Check Production" button | No |
| `dashboard_url` | Dashboard URL to POST manifests to | No |

## Future

- GitHub App (zero-config install, no workflow file needed per repo)
- SBOM generation (CycloneDX)
- SAST via Semgrep integration
- Auditor evidence export (PDF/ZIP per framework)
- Dashboard authentication

## Roadmap

See [docs/implementation-checklist.md](docs/implementation-checklist.md).
