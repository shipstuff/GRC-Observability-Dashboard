# Architecture

## System Design: Hub and Spoke

```
┌─────────────────────────────────────────┐
│         Central GRC Dashboard            │
│         (aggregates everything)          │
└──────────┬──────────┬──────────┬────────┘
           │          │          │
      Repo A      Repo B      Repo C
      (GH Action)  (GH Action)  (GH Action)
      scans on     scans on     scans on
      PR/deploy    PR/deploy    PR/deploy
```

Each repo:
- Runs the same reusable GitHub Action
- Generates a local compliance badge and manifest file committed to the repo
- POSTs the manifest to the central dashboard API

The central dashboard:
- Receives and stores manifests from all repos
- Provides the org-wide view, trends, and reporting

## Single Source of Truth Principle

```
❌ Traditional (drift-prone):
   Lawyer writes policy → hope code matches → audit finds gaps

✅ Our approach (compliance-as-code):
   Code is scanned → scan produces facts → facts generate policy
                                         → facts feed dashboard
```

The scan is the authority. The privacy policy, ToS, and dashboard status are all derivatives of what the scan found. If the scan says "this repo collects email via a form and sends it through Resend," then:
- The privacy policy gets a section about email collection and Resend as a processor
- The dashboard shows "data collection: email (processor: Resend)" as a tracked item

## GitHub Action Flow

The reusable GitHub Action runs in its own container and can scan ANY repo regardless of language:

**Outputs:**
1. `manifest.yml` — structured compliance data (committed to repo)
2. POST to dashboard API — feeds the central dashboard
3. Compliance badge SVG — visual status indicator
4. Generated policies — only for repos serving public-facing sites

## Tech Stack

- **GitHub Action**: Reusable workflow (`.github/workflows/grc-scan.yml`)
- **Scanner**: Node.js script using AST parsing + regex
- **Dashboard API**: Express endpoint (or separate service)
- **Dashboard UI**: HTMX (matches joeeftekhari.com stack)
- **Storage**: Postgres on Digital Ocean droplet (or JSON files to start)

## Build Tiers

### Tier 1 (Start Here)
- Scanner detects: data collection, security headers, dependencies, secrets, TLS, security.txt
- Outputs: manifest.yml, generated policies (privacy policy, ToS, security.txt, vulnerability disclosure)
- Dashboard: checklist view per repo

### Tier 2 (After Tier 1 Works)
- Add: framework mapping (NIST CSF controls → scan results)
- Add: branch comparison (main vs feature branches)
- Add: trend tracking over time
- Dashboard: framework compliance percentages

### Tier 3 (Portfolio Showstopper)
- Add: audit evidence export (PDF/ZIP per framework)
- Add: AI-powered gap analysis ("you're missing X for SOC 2")
- Add: remediation suggestions with auto-fix PRs
- Dashboard: auditor-ready report generation

## Where AI Fits In

| Task | Deterministic Scan | AI Layer |
|---|---|---|
| "Is there a form?" | Regex for `<form`, POST routes | — |
| "What data does it collect?" | Parse input names | Classify as PII vs non-PII |
| "Is this a new third-party service?" | Check imports/API calls | Determine if it's a data processor |
| "Is the policy still accurate?" | Diff manifest vs last policy | Explain what changed in plain English |
| "What should we do about this?" | — | Generate remediation steps |

Additional AI opportunities:
- LLM reviews code diffs for new data collection patterns humans might miss
- Auto-classifies data types (PII vs non-PII)
- Generates remediation suggestions when a check fails
- Summarizes compliance posture changes in plain English for non-technical stakeholders
