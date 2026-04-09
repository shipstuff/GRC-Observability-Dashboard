# GRC Observability Dashboard

Automated compliance scanning for every repo in your GitHub organization. Scans code for data collection, security issues, and governance gaps — then generates policies, risk assessments, and framework compliance reports.

## What It Does

On every push or PR, the scanner:

- **Detects** data collection points (forms, API endpoints, cookies, tracking scripts)
- **Identifies** third-party services and their data processing implications
- **Checks** security headers, HTTPS/TLS, dependency vulnerabilities, secrets in code
- **Evaluates** access controls (branch protection, auth on sensitive routes)
- **Generates** compliance artifacts:

| Report | Description |
|--------|-------------|
| `manifest.yml` | Structured compliance data — single source of truth |
| `privacy-policy.md` | GDPR + CCPA compliant, auto-populated from scan findings |
| `terms-of-service.md` | Site-specific ToS with detected services and features |
| `security.txt` | RFC 9116 compliant security contact file |
| `vulnerability-disclosure.md` | Responsible disclosure policy with in-scope/out-of-scope |
| `incident-response-plan.md` | NIST SP 800-61 based IRP with site-specific procedures |
| `risk-assessment.md` | Likelihood x impact matrix with framework mappings |
| `nist-csf-report.md` | NIST CSF 2.0 compliance with SOC 2 + ISO 27001 cross-mapping |
| `security-headers-report.md` | Header status + copy-paste Express/Nginx fix |
| `access-controls-report.md` | Branch protection and code-level auth findings |

## Quick Start

### 1. Add the workflow to your repo

Create `.github/workflows/grc-scan.yml`:

```yaml
name: GRC Compliance Scan

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: write
  pull-requests: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run GRC scan
        uses: shipstuff/GRC-Observability-Dashboard@main
        with:
          site_url: https://yoursite.com  # optional — for live header/TLS checks
          dashboard_url: https://your-dashboard.example.com  # optional — POST manifest to dashboard

      - name: Upload reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: grc-scan-results
          path: .grc/
          include-hidden-files: true
          retention-days: 90

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          if [ -f .grc/pr-comment.md ]; then
            BODY=$(cat .grc/pr-comment.md)
          else
            BODY="## GRC Compliance Scan

          Scan complete. Download **grc-scan-results** artifact for full reports."
          fi
          gh pr comment "${{ github.event.pull_request.number }}" --body "$BODY"
```

### 2. Add your site config

Create `.grc/config.yml`:

```yaml
site_name: Your Site Name
site_url: https://yoursite.com
owner_name: Your Name
contact_email: you@example.com
log_retention_days: 90
jurisdiction:
  - gdpr
  - ccpa
```

### 3. Update your .gitignore

Add these lines to exclude generated scan output (only the config should be committed):

```
# GRC scan output (auto-generated)
.grc/*
!.grc/config.yml
```

### 4. Push or open a PR

The scan runs automatically. Reports are available as downloadable artifacts on the Actions run page.

## AI Enhancements (Optional)

Add an `ai` section to `.grc/config.yml`:

```yaml
ai:
  enabled: true
  provider: anthropic  # or openai
```

Then add the API key as a GitHub secret (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).

When enabled, AI provides:
- PII classification for detected form fields
- Plain-English risk narratives with business context
- PR comment summaries
- Gap analysis with prioritized recommendations

The scanner works fully without AI — it only enhances output when available.

## Dashboard

The dashboard provides a central view of compliance posture across all repos in your org. Repos POST their manifests to the dashboard API via the GitHub Action.

**Features:**
- Org-wide stats (compliance %, NIST CSF %, vulnerabilities, secrets)
- Per-repo detail view with data collection, headers, TLS, deps, access controls, artifacts
- NIST CSF tab with per-function scores, all 18 controls, SOC 2 + ISO 27001 cross-references
- Branch comparison tab showing compliance diff across branches
- Trend tracking with historical compliance, NIST, and vulnerability charts

### Running the Dashboard

```bash
git clone https://github.com/shipstuff/GRC-Observability-Dashboard.git
cd GRC-Observability-Dashboard
npm install
npm run dashboard
```

Dashboard runs at `http://localhost:3001`. Send it a manifest:

```bash
npm run scan -- /path/to/repo --url=https://yoursite.com
curl -X POST -H "Content-Type: application/x-yaml" \
  --data-binary @/path/to/repo/.grc/manifest.yml \
  http://localhost:3001/api/report
```

### Dashboard API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/report` | POST | Receive a manifest (YAML or JSON) |
| `/api/repos` | GET | All repo summaries |
| `/api/repos/:owner/:name` | GET | Full manifest for a repo |
| `/api/history/:owner/:name` | GET | Historical scan data |

## Running the Scanner Locally

```bash
npm run scan -- /path/to/your/repo --url=https://yoursite.com
```

Reports are written to `/path/to/your/repo/.grc/`.

## Architecture

```
GRC-Observability-Dashboard (this repo)
├── action.yml              ← Composite GitHub Action
├── scanner/
│   ├── index.ts            ← Entry point
│   ├── rules/              ← Detection rules (forms, deps, cookies, etc.)
│   ├── generators/         ← Report generators (risk, headers, framework)
│   ├── frameworks/         ← NIST CSF mappings + SOC 2/ISO 27001 cross-map
│   ├── templates/          ← Handlebars templates for policies
│   └── ai/                 ← Optional AI enhancement layer
├── dashboard/
│   ├── server.ts           ← Express API + HTMX UI
│   ├── store.ts            ← JSON file storage + history tracking
│   └── views/render.ts     ← Dashboard templates
├── examples/               ← Example workflow for consuming repos
└── docs/                   ← Architecture and reference docs

Your repo
├── .github/workflows/grc-scan.yml  ← Workflow file (copy from Quick Start)
└── .grc/
    ├── config.yml                  ← Your site config (committed)
    └── *.md                        ← Generated reports (gitignored)
```

## Self-Hosting for Your Own Org

This project is designed to be forked and self-hosted:

1. **Fork this repo** to your org
2. **Deploy the dashboard** (`npm run dashboard`) to any server, VM, or container
3. **Update the action reference** in your repos' workflows to point to your fork
4. **Add `DASHBOARD_URL`** as a GitHub org variable so the action knows where to POST

The scanner and action work out of the box for any repo. The dashboard is a single Express server with JSON file storage — no database required.

## Roadmap

See [docs/implementation-checklist.md](docs/implementation-checklist.md) for the full roadmap.
