# GRC Observability Dashboard

## Project Overview

Automated GRC (Governance, Risk, and Compliance) scanning platform. A GitHub Action scans repos for data collection, security issues, and governance gaps, then generates compliance documents and reports. Results feed a central Cloudflare Worker dashboard.

## Architecture

- **Scanner** (`scanner/`) — TypeScript, runs detection rules and generates reports
- **Dashboard** (`dashboard/`) — Hono on Cloudflare Workers with KV storage
- **Action** (`action.yml`) — Composite GitHub Action wrapping the scanner
- No Express server — dashboard is Cloudflare Worker only, use `wrangler dev` for local development

## Key Commands

- `npm run scan -- /path/to/repo --url=https://site.com` — run scanner locally
- `npx wrangler dev` — run dashboard locally (port 8788)
- `npx wrangler deploy` — deploy dashboard to Cloudflare

## Roadmap

Single source of truth: `docs/implementation-checklist.md`

## Branch Policy

Always use feature branches + PRs. Never push to main directly.
