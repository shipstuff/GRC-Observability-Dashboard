# Architecture

## Hub and spoke

```
         ┌──────────────────────────┐
         │   Cloudflare Worker      │
         │   (dashboard + KV)       │
         └──────────┬───────────────┘
                    │ POST /api/report (OIDC-authed)
                    │
      ┌─────────────┼─────────────┐
      │             │             │
   Repo A         Repo B        Repo C
   GitHub Action  GitHub Action GitHub Action
   writes .grc/   writes .grc/  writes .grc/
   commits policy commits policy commits policy
```

Every consuming repo runs the same composite action (`action.yml`). Each run:

1. Scans the repo tree (Node source + `package.json` + `requirements.txt` + `pyproject.toml`) and the live URL if configured.
2. Writes a YAML manifest to `.grc/manifest.yml` and generated policy markdown to `docs/policies/` + `/.well-known/security.txt`.
3. On PRs, commits generated policies back to the PR branch (attributed to `grc-bot`).
4. Mints a short-lived GitHub OIDC JWT and POSTs the manifest to the dashboard's `/api/report`.

The dashboard (Hono on Cloudflare Workers) verifies the JWT against GitHub's JWKS, stores the manifest in KV keyed by `manifest:<repo>:<branch>`, and renders HTML views with HTMX.

## Single source of truth

The scan is the authority.

```
❌ Drift-prone:
   Lawyer writes policy → hope code matches → audit finds gaps

✅ Compliance-as-code:
   Code scanned → scan produces facts → facts generate policy
                                      → facts feed dashboard
                                      → facts feed framework scoring
```

If the scan finds that a repo collects email via a form and sends it through Resend, downstream outputs follow automatically: the privacy policy names Resend as a processor, the dashboard's data-collection row lists "email (processor: Resend)", and the NIST CSF check for data inventory flips to `pass` based on that evidence.

## Tech stack

- **Scanner:** Node 20, TypeScript via `tsx` at runtime. No build step.
- **Scan rules:** `scanner/rules/*.ts` — one file per concept (forms, endpoints, secrets, dependencies, access controls, AI systems, …). Each returns structured findings.
- **Policy templates:** Handlebars (`.hbs`) in `scanner/templates/`. Rendered to markdown by `scanner/render.ts`.
- **Reports:** `scanner/generators/*.ts` — markdown output per framework / concern (NIST CSF, EU AI Act, risk assessment, security headers, access controls).
- **Dashboard:** Hono on Cloudflare Workers. Inlined HTML + Press Start 2P / JetBrains Mono + HTMX for tab navigation.
- **Storage:** Cloudflare KV, two key shapes: `manifest:<repo>:<branch>` for current state, `history:<repo>` for trend data.
- **Auth:** GitHub OIDC on `POST /api/report`. No shared secrets; see `dashboard/auth.ts`.

## Where AI fits in

The AI enhancement layer (Phase 4) is optional — the scanner works fully without it. When enabled and given an API key, an LLM refines PII classification, rewrites risk narratives in plain English, and generates gap analyses with prioritized recommendations.

The EU AI Act detection + risk classification (Phase 8) is a separate thing: purely deterministic scanning of consuming repos for AI SDK imports, framework imports, and outbound AI API URLs. No LLM involvement in that path.

## What each folder is for

| Folder | Purpose |
|---|---|
| `scanner/rules/` | Per-concept scan rules producing structured findings |
| `scanner/templates/` | Handlebars policy templates |
| `scanner/generators/` | Markdown report generators |
| `scanner/frameworks/` | Framework definitions (NIST CSF, EU AI Act) and cross-maps |
| `scanner/ai/` | Optional LLM enhancement layer |
| `dashboard/` | Cloudflare Worker + render functions |
| `dashboard/views/render.ts` | All HTML rendering — server-rendered, HTMX for tab swaps |
| `scripts/` | Standalone tsx utilities (smoke tests, one-off maintenance) |
| `docs/` | Reference documentation (this file, checklist, GRC fundamentals, badges) |

## Not covered here

- **What the scanner detects** — see the "What It Scans" section in the [README](../README.md).
- **How to set up a fork** — see [README § Setup](../README.md#setup).
- **The manifest schema** — `scanner/types.ts` is the authoritative source. The TypeScript types are the schema.
- **Roadmap** — [implementation-checklist.md](implementation-checklist.md).
- **How to extend the scanner** — [CONTRIBUTING.md](../CONTRIBUTING.md).
