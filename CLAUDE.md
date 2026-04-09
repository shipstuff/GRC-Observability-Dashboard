# GRC Observability Dashboard

## Project Overview

This is a GRC (Governance, Risk, and Compliance) AI Automation platform. The goal is to build a centralized compliance dashboard that receives scan data from GitHub Actions running across every repo in the `shipstuff` GitHub organization.

## Architecture: Hub and Spoke (Option C)

Each repo in the org runs a **reusable GitHub Action** that:
1. Scans the repo for data collection, security headers, dependencies, secrets, TLS, etc.
2. Generates a **compliance manifest** (`manifest.yml`) committed to the repo
3. Generates **compliance artifacts** (privacy policy, ToS, etc.) for repos that serve public-facing sites
4. POSTs the manifest to the **central GRC dashboard API**

The dashboard aggregates all manifests and provides:
- Org-wide compliance posture
- Per-repo and per-branch compliance status
- Framework mapping (NIST CSF, SOC 2, ISO 27001, GDPR, CCPA)
- Auditor-ready evidence export (future)

## Key Principle: Single Source of Truth

Policies are NOT hand-written. The scan produces facts, and facts generate policies. The same scan data feeds both the generated artifacts AND the dashboard. Nothing drifts because everything derives from the scan.

## Known Repos

- `shipstuff/joeeftekhari.com` — Personal portfolio/blog. TypeScript, Express, HTMX. Hosted on Digital Ocean droplet. Has a contact form (Resend), game with username input at /game.
- `shipstuff/AOBuddy` — HOA Dashboard. Monorepo with `packages/api` and `packages/web`. No live site yet.
- `shipstuff/GRC-Observability-Dashboard` — This repo. The central dashboard. Deployed at grc-dashboard.jdeftekhari.workers.dev.

## Roadmap

Single source of truth: `docs/implementation-checklist.md`. All other docs are reference material — do not duplicate the roadmap.

## User Context

The user (Joe Eftekhari) is learning GRC engineering fundamentals and building toward a "GRC AI Automation Engineer" role. This project serves as both a learning tool and a portfolio piece. The personal site at joeeftekhari.com is the first repo to integrate.
