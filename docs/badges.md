# GitHub App Badge and Repo Status Badge

This project now exposes a public SVG status badge from the deployed Cloudflare Worker:

- `https://grc-dashboard.jdeftekhari.workers.dev/badge?repo=OWNER/REPO`
- `https://grc-dashboard.jdeftekhari.workers.dev/badge/OWNER/REPO`
- Optional `?branch=BRANCH`
- Health probe: `https://grc-dashboard.jdeftekhari.workers.dev/health`

## Add the badge to another repo

Use standard Markdown in any README:

```md
[![GRC observability](https://grc-dashboard.jdeftekhari.workers.dev/badge?repo=shipstuff/GRC-Observability-Dashboard)](https://grc-dashboard.jdeftekhari.workers.dev/repo/shipstuff/GRC-Observability-Dashboard)
```

For a non-default branch:

```md
![GRC observability](https://grc-dashboard.jdeftekhari.workers.dev/badge/shipstuff/GRC-Observability-Dashboard?branch=main)
```

## How the badge is computed

The worker reads the latest stored manifest for the repo and branch, then emits one of four states:

- `pass NN%`
- `warn NN%`
- `fail NN%`
- `not scanned`

The score and color are derived from the existing compliance summary:

- `fail` if secrets were detected, critical vulnerabilities exist, or compliance is below 50%
- `warn` if high vulnerabilities exist, HTTPS is not enforced, security headers are incomplete, or compliance is below 80%
- `pass` otherwise

## GitHub App custom badge

GitHub’s "custom badge for your GitHub App" is not a dynamic URL. Per GitHub Docs, it is a static image you upload in the app settings, with a configurable background color.

Reference:

- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/creating-a-custom-badge-for-your-github-app

Operationally, that means:

1. Register or edit the GitHub App in GitHub settings.
2. Upload a static PNG/JPG/GIF logo under 1 MB.
3. Set the badge background color in the app settings.
4. Use the worker-hosted `/badge` endpoint separately for live per-repo observability status in READMEs or docs.

This split is intentional:

- GitHub App badge: branding for the app itself
- Worker badge endpoint: live compliance status for any scanned repo
