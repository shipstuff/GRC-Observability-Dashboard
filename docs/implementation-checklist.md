# Implementation Checklist

The single source of truth for the GRC Observability Dashboard roadmap. Each item is both a **learning exercise** (understand the GRC concept) and a **scanner/dashboard feature** (automate detection and reporting).

## Phase 1: Policies & Documentation — DONE

### Item 1: Privacy Policy (GDPR, CCPA) — DONE
- [x] Define the template structure (sections, conditional blocks)
- [x] Build the scanner rules for data collection detection (forms, endpoints, cookies, tracking, dependencies)
- [x] Create `.grc/config.yml` schema for static site info
- [x] Generate a real privacy policy for joeeftekhari.com
- [x] Add privacy policy status to manifest schema
- [x] Deploy to the live site (handled by Phase 7 policy deployment flow — scanner commits to PR branch at `docs/policies/privacy-policy.md`)
- **GRC concept:** Data mapping, lawful basis for processing, data subject rights

### Item 2: Terms of Service — DONE
- [x] Define ToS template structure
- [x] Identify what terms are site-specific vs boilerplate
- [x] Auto-detect services (game, AI tools, contact form) for Description of Service section
- [x] Generate ToS for joeeftekhari.com
- [x] Deploy to the live site (via Phase 7)
- **GRC concept:** Legal agreements, liability limitation, acceptable use

### Item 3: security.txt — DONE
- [x] Generate /.well-known/security.txt following RFC 9116
- [x] Scanner checks for its existence and validity
- [x] Includes required fields (Contact, Expires) and recommended fields (Canonical, Policy, Preferred-Languages)
- [x] `Expires` pinned to Jan 1 of next year for idempotency (prevents spurious commits)
- [x] Deploy to the live site (via Phase 7 — scanner writes to `.well-known/security.txt` regardless of output_dir)
- **GRC concept:** Vulnerability coordination, responsible disclosure standards

### Item 4: Responsible Vulnerability Disclosure Page — DONE
- [x] Generate disclosure policy with in-scope/out-of-scope sections
- [x] In-scope auto-populated from scan findings
- [x] Out-of-scope lists third-party services with contact links
- [x] Includes safe harbor provisions and response timelines
- [x] Scanner checks for its existence
- [x] Deploy to the live site (via Phase 7)
- **GRC concept:** Coordinated vulnerability disclosure, safe harbor provisions

## Phase 2: Technical Controls — DONE

### Item 5: Security Headers — DONE
- [x] Scanner checks response headers from live site
- [x] Auto-generates security headers report with recommendations
- [x] Generates copy-paste Express middleware and Nginx config
- [x] CSP auto-generated based on detected resources (e.g., Google Analytics domains)
- [x] Implemented headers on joeeftekhari.com (0/6 → 6/6)
- **GRC concept:** Defense in depth, OWASP recommendations
- **Known limitation:** CSP generator only catches resources visible in HTML (Google Analytics) — CDN imports for external libs (unpkg, jsdelivr, cdnjs) aren't detected automatically. Manual CSP edits may be needed.

### Item 6: Access Controls — DONE
- [x] Scanner detects admin/sensitive routes and checks for auth middleware
- [x] Generates access controls report with remediation commands
- [x] Scanner uses GitHub **Rulesets API** (`GET /repos/:owner/:repo/rules/branches/main`) — works with standard `GITHUB_TOKEN` read scope, no admin needed
- [x] Extracts required_approving_review_count from `pull_request` rule types (aggregates strictest across org + repo rulesets)
- [x] Detects signed commits enforcement via `required_signatures` rule type
- [x] Surfaces individual rule types (deletion, non_fast_forward, required_linear_history, etc.) in findings
- [x] Handles empty rules array (explicit unprotected state) vs CLI unavailable (unknown state)
- [x] Enabled branch protection on joeeftekhari.com main → now reports: 1 required review, signed commits not required (advisory)
- **GRC concept:** Principle of least privilege, separation of duties

### Item 7: HTTPS Enforcement & Certificate Management — DONE
- [x] Verify HTTPS redirect is in place
- [x] Monitor certificate expiry
- [x] Scanner checks TLS configuration
- **GRC concept:** Encryption in transit, certificate lifecycle management

### Item 7b: Input Validation & Sanitization
- [ ] New scanner rule (`scanner/rules/input-validation.ts`) that checks for sanitization
- [ ] Detect presence of sanitization libraries (xss, dompurify, express-validator, sanitize-html)
- [ ] Check if templating engine auto-escapes output (Handlebars `{{}}` vs EJS `<%-`)
- [ ] Flag routes that pass `req.body` directly to DB queries or HTML output without middleware
- [ ] Add findings to manifest and dashboard
- **GRC concept:** OWASP A03 (Injection), secure coding practices, technical control verification

## Phase 3: GRC Artifacts — DONE

### Item 8: Risk Assessment — DONE
- [x] Auto-generate risk assessment from scan findings
- [x] Likelihood x impact matrix with visual grid
- [x] Framework mappings per risk (NIST CSF, SOC 2, ISO 27001, GDPR)
- [x] Actionable mitigations that cross-reference other reports
- [x] Executive summary with severity counts
- [x] Methodology section
- **GRC concept:** Risk identification, qualitative risk analysis, risk appetite
- **Known limitation:** Heuristic-based. Likelihood and impact are hardcoded per risk type, not calculated from codebase context. A CVE in a dev dependency gets the same rating as one in a prod dependency.

### Item 9: Incident Response Plan — DONE
- [x] Generate IRP template following NIST SP 800-61 lifecycle
- [x] Scope auto-populated from scan findings (game, third-party services, etc.)
- [x] Contact list includes third-party service contacts with DPA links
- [x] Containment commands specific to the detected stack (pm2, ufw, credential rotation)
- [x] GDPR 72-hour and CCPA breach notification requirements included based on jurisdiction
- [x] Incident log template and annual testing checklist
- [x] Scanner checks for IRP document existence
- **GRC concept:** NIST SP 800-61 incident response lifecycle

### Item 10: Risk Register — DONE
- [x] Auto-generated from scan findings (part of risk assessment)
- [x] Each risk has: ID, description, likelihood, impact, severity, mitigation, status, framework mappings
- [x] Structured `Risk[]` array ready for dashboard consumption
- [ ] Accepted-risk mechanism — allow users to declare acknowledged/accepted risks in `.grc/config.yml` so they stop showing as outstanding
- **GRC concept:** Risk treatment options (accept, mitigate, transfer, avoid)

### Item 11: Framework Mapping — DONE
- [x] NIST CSF 2.0 as primary framework (18 controls mapped)
- [x] Each scan check maps to NIST CSF subcategories with pass/partial/fail/N/A evaluation
- [x] Per-function compliance percentages (Identify, Protect, Detect, Respond, Recover)
- [x] Cross-mapped to SOC 2 Trust Service Criteria (12 controls)
- [x] Cross-mapped to ISO 27001 Annex A (22 controls)
- [x] Evidence strings for every control assessment
- [x] Gaps section highlighting failures with specific evidence
- **GRC concept:** Control frameworks, control objectives, evidence collection
- **Known limitation:** 18 of NIST CSF 2.0's ~100 subcategories. "75% NIST CSF compliant" is 75% of our 18 controls, not the full framework.

## Phase 4: AI Enhancement Layer — VALIDATED

Optional module — scanner works fully without AI. If an API key is provided, AI enhances output. Validated end-to-end with OpenAI gpt-4o-mini on joeeftekhari.com.

### AI Module Foundation — DONE
- [x] Create `scanner/ai/provider.ts` with provider abstraction (Anthropic, OpenAI)
- [x] Add `ai` section to `.grc/config.yml` schema (enabled, provider)
- [x] API key via environment variable / GitHub secrets (never in config file)
- [x] Graceful degradation — disabled in config: silent skip; enabled without key: warns and skips

### AI-Enhanced Scans — VALIDATED
- [x] PII classification — 32 fields classified (email → directly-identifying, cookie_data → pseudonymous, game fields → non-personal). Fixed markdown code fence parse issue (PR #19).
- [x] Risk narrative enhancement — 4 risks enhanced with plain-English business context
- [x] Validated with real OpenAI API key — output quality is good, classifications are accurate
- [ ] Context-aware CSP generation — AI fetches page, sees actual resources, generates precise policy
- [ ] Remediation code generation — AI looks at actual codebase patterns and generates specific fixes

### AI-Enhanced Outputs — VALIDATED
- [x] PR comment summarization — generates compliance score, critical/high risk highlights, actionable next step
- [x] Gap analysis — 3 prioritized recommendations with effort estimates and framework control mappings
- [x] AI report output at `.grc/ai-analysis.md`
- [x] PR comment output at `.grc/pr-comment.md` for GitHub Action to post
- [x] End-to-end validated with real API key — all four enhancements produce useful, actionable output
- [ ] Auto-fix PRs — AI generates remediation PRs for common issues
- [ ] Auditor-friendly summaries — AI translates technical findings into compliance language
- **Known limitation:** AI output currently lives in `.grc/` (gitignored) and the PR comment. Risk narratives and gap analysis are not visible on the dashboard.

## Phase 5: Dashboard Build — DONE

### Tier 1: Core Scanner + Dashboard — DONE
- [x] Build scanner with universal detection rules
- [x] Define manifest.yml schema (see `docs/manifest-spec.md`)
- [x] Build policy/artifact generators from scan data
- [x] Build report generators (security headers, access controls, risk assessment)
- [x] Build GitHub Action (composite action at `action.yml`) wrapping the scanner
- [x] Action tested and working on shipstuff/joeeftekhari.com
- [x] README with setup instructions
- [x] Build dashboard API (Hono on Cloudflare Worker)
- [x] Build dashboard UI (HTMX) — retro video game theme with CRT scanlines
- [x] Deploy dashboard to Cloudflare Worker (grc-dashboard.jdeftekhari.workers.dev)
- [x] Auto-deploy via GitHub Action on push to main

### Tier 2: Framework Mapping + Branch Tracking — DONE
- [x] NIST CSF tab — per-function HP bars, all 18 controls with pass/fail, SOC 2 + ISO 27001 cross-refs, gaps with evidence
- [x] Branch comparison tab — side-by-side compliance/NIST/vulns/headers with diff vs main
- [x] Trend tracking tab — ASCII bar charts for compliance score, NIST score, and vulnerability count over time
- [x] Historical scan storage (last 500 entries per repo)
- [x] Branch dropdown that switches overview/nist/trends data
- [x] Repos sorted by most recent scan on homepage
- [x] Search/filter by repo name
- [x] "Check Production" button — hits live URL from dashboard, updates headers/TLS on demand
- [x] Static scan + live check separation (no 90s sleep race condition anymore)
- [x] Merge-with-existing-data logic (static scans don't wipe out previous live check results)
- [x] site_url tracking per repo (passed as query param when manifest is POSTed)
- [x] Check Production verifies configured policy URLs (see Phase 7 policy_urls support)

### Tier 3: Auditor Evidence Export
- [ ] AI-powered gap analysis in dashboard (depends on Phase 4 validation)
- [ ] Auto-fix PR generation (depends on Phase 4 validation)
- [ ] Evidence packages per framework (PDF/ZIP) — moved to Phase 9 Sub-phase B

## Phase 6: Open Source Readiness — DONE

### Scanner + Action — DONE
- [x] Composite GitHub Action works for any public repo
- [x] README with setup instructions
- [x] Example workflow file at `examples/grc-scan.yml`
- [x] Slim consuming workflow (~15 lines, PR commenting built into action)
- [x] Action passes `GH_TOKEN` to scan step for GitHub API calls

### Dashboard Self-Hosting — DONE
- [x] Make org name configurable via `ORG_NAME` env var in wrangler.toml
- [x] Add `dashboard_url` input to the action so repos know where to POST
- [x] `wrangler.toml` with placeholder KV ID and setup comments
- [x] Single codebase (Cloudflare Worker only, no Express duplication)
- [x] README with wrangler setup guide (login, create KV, deploy)
- [x] Removed hardcoded org references from code
- [x] Removed personal/draft files from repo
- [x] Cleaned up outdated docs
- [x] Deploy workflow injects KV ID and ORG_NAME from secrets/vars at deploy time (not in committed config)
- [x] **Validate the fork path end-to-end** — dry-ran from a fresh clone: `npm install` (127 packages, 3s, clean), `wrangler dev --local` boots against the placeholder KV id and serves `/health` + `/` correctly. Found a real bug in `.github/workflows/deploy.yml`: the ORG_NAME sed uncommented `ORG_NAME = "..."` but left `[vars]` commented, so the var ended up at top-level TOML and never reached the worker. Fixed by switching ORG_NAME + GRC_AUDIENCE to `wrangler deploy --var`. Added a preflight step that fails fast with a clear message when `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_KV_ID` is missing. Also fixed `hono` moderate CVE via `npm audit fix`.
- [x] Add authentication to dashboard API — POST /api/report verifies a GitHub OIDC JWT against GitHub's JWKS and checks that the token's `repository` claim matches the manifest's `repo` field. No shared secret required — consumers add `id-token: write` to workflow permissions and the composite action handles token minting. Dashboard optionally overrides audience via `GRC_AUDIENCE` env var. `GRC_AUTH_BYPASS=1` available for local `wrangler dev` only. `/api/check-production` intentionally left unauthenticated — it's UI-triggered and can only act on already-authenticated stored state.

### Documentation
- [x] Contributing guide — `CONTRIBUTING.md` ships with the dev loop and three extension-point walkthroughs (scan rule, policy template, framework). Linked from the README.
- [x] How to add new scan rules — in `CONTRIBUTING.md` "Adding a scan rule" section.
- [x] How to add new policy templates — in `CONTRIBUTING.md` "Adding a policy template" section, including the idempotency rules that keep scans from producing noisy commits.

## Phase 7: Policy Deployment Flow — DONE

**The problem:** Scanner generated policies into `.grc/` (gitignored). Files never reached the repo, never got deployed, never got served. The artifact scanner then reported them as "missing" even though the scanner had just produced them. This was the biggest correctness gap in the project.

### The Flow — DONE
- [x] Add `output_dir` to `.grc/config.yml` (default `docs/policies`)
- [x] Scanner writes policy markdown files to `output_dir` (not `.grc/`)
- [x] `security.txt` always goes to `.well-known/security.txt` (RFC 9116)
- [x] Scanner writes the effective `outputDir` to `.grc/output-dir` so the action stages the right path (no YAML parsing in bash)
- [x] Reports (risk assessment, NIST CSF, headers, access controls, AI analysis, PR comment) stay in `.grc/`
- [x] On PR scans: action stages generated files, compares to repo state, commits only if changed
- [x] Commits attributed to `grc-bot` for clarity in git history
- [x] On merge to main: no commits happen — policies already merged via the original PR
- [x] Graceful failure if `contents: write` not granted — warns, continues, scan + dashboard POST still run
- [x] `output_dir` sanitization (empty string, absolute path, path escape) → falls back to default with warning

### Required Changes in Consuming Repos — DONE (documented)
- [x] Workflow permission `contents: write` (was `read`)
- [x] Implemented on joeeftekhari.com (PR #37)
- [x] README documents the permission change

### Idempotency Fixes — DONE
- [x] Removed scan date and commit hash from policy body (git history already tracks this)
- [x] security.txt `Expires` pinned to Jan 1 of next year (stable within calendar year)
- [x] Three consecutive scans produce byte-identical output
- [x] Action commits exactly once per real content change

### Manifest Accuracy Fix — DONE
- [x] `scanArtifacts` moved out of the parallel scan block in `scan()`
- [x] Now runs in `main()` AFTER policies are written to disk
- [x] Manifest reflects the real filesystem state, not a pre-generation snapshot
- [x] No more hardcoded `manifest.artifacts = "generated"` workaround
- [x] Manifest written LAST so it captures everything the scanner just did

### policy_urls Config — DONE
**Purpose:** Let users declare where they serve each policy on their live site. Framework-agnostic — Express routes, Next.js pages, Hugo permalinks, static files, custom paths, full external URLs all work.

- [x] New optional `policy_urls` section in `.grc/config.yml`:
  ```yaml
  policy_urls:
    privacy_policy: /privacy-policy
    terms_of_service: /legal/terms
    vulnerability_disclosure: https://vdp.example.com/
    security_txt: /.well-known/security.txt
  ```
- [x] Scanner always emits `policyUrls` as object (empty `{}` when opted out, never `undefined`)
- [x] Manifest gets `policyUrls` field so dashboard knows what to check
- [x] Dashboard's Check Production reads `manifest.policyUrls` and verifies only configured URLs
- [x] Three states per policy: `served` (2xx response), `unreachable` (configured but failed), `not-configured` (not in config)
- [x] Artifact field NOT touched by Check Production — artifact describes repo state (scanner's domain), `policyServed` describes live state (response only). No conflation.
- [x] Opt-out path: user removes `policy_urls` from config → worker clears stored URLs on next POST
- [x] No defaults — zero URLs checked unless user explicitly configures them

### Consuming Repo Work
- [x] joeeftekhari.com workflow updated with `contents: write` permission
- [x] joeeftekhari.com has `docs/policies/*.md` and `.well-known/security.txt` committed (via scanner on PR #38)
- [ ] joeeftekhari.com does NOT yet serve policies at public URLs (Express server needs routes to serve markdown at pretty URLs). User closed attempt to add routes (PR #39) — will handle routing + `policy_urls` config themselves when ready.

## Phase 8: AI Compliance Layer — DONE

**Why this direction:** The EU AI Act becomes enforceable August 2026 with fines up to €35M or 7% of global turnover. The scanner already detects AI SDK usage via dependency scanning but does nothing AI-compliance-specific with those findings. This phase turns "security compliance scanner" into "security + AI compliance scanner."

**Our own meta-obligation:** The scanner uses Anthropic/OpenAI in its AI layer. That makes the dashboard itself an "AI system" under the EU AI Act. When we ship this, the scanner should scan itself and produce its own AI compliance documentation.

### Sub-phase A: AI System Detection — DONE
- [x] New scan rule `scanner/rules/ai-systems.ts`
- [x] Detect Node SDK imports: `openai`, `@anthropic-ai/sdk`, `cohere-ai`, `@google/generative-ai`, `@huggingface/inference`, `@mistralai/mistralai`, `groq-sdk`, `together-ai`, `replicate`
- [x] Detect framework imports: `langchain`, `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, `llamaindex`, `ai` (Vercel AI SDK), `@ai-sdk/openai`, `@ai-sdk/anthropic`
- [x] Detect self-hosted indicators: `ollama`, `@ollama/ollama`
- [x] Detect ML training libraries: `@tensorflow/tfjs`, `onnxruntime-node`
- [x] Detect vector DB usage: `@pinecone-database/pinecone`, `weaviate-ts-client`, `chromadb`, `@qdrant/js-client-rest`, `@upstash/vector`
- [x] Detect Python packages: `openai`, `anthropic`, `cohere`, `langchain`, `llama-index`, `transformers`, `torch`, `tensorflow`, `scikit-learn`, `pinecone-client`, `chromadb`, `weaviate-client`, `qdrant-client`, `ollama`, `vllm`, `ctransformers` (via `requirements.txt`)
- [x] Detect outbound API calls: `api.openai.com`, `api.anthropic.com`, `api.cohere.ai`, `generativelanguage.googleapis.com`, `api.mistral.ai`, `api.groq.com`, `api.together.xyz`, `api.replicate.com`
- [x] Add `AISystem` type and `aiSystems: AISystem[]` field to manifest schema
- [x] Each detected system includes: provider, sdk name, file location, category (inference/training/vector-db/framework/self-hosted)
- [x] Verified on joeeftekhari.com: detected OpenAI via package.json
- [x] Verified on GRC-Observability-Dashboard: detected OpenAI + Anthropic via outbound API call patterns
- [ ] Correlate with `forms.ts` and `endpoints.ts` output to populate `dataFlows` (currently empty array — deferred to Sub-phase B or later)
- **GRC concept:** AI inventory, data flow mapping for AI

### Sub-phase B: AI Risk Classification — DONE
- [x] Heuristic classifier (`scanner/rules/ai-risk-classifier.ts`) mapping context signals to EU AI Act risk tiers:
  - **Prohibited**: path keywords covering social scoring, subliminal manipulation, vulnerability exploitation (Art. 5)
  - **High-risk**: path keywords for hiring/recruit/CV screening, credit/underwriting, medical/clinical, biometric ID, exam grading/admissions (Annex III)
  - **Limited risk**: category `inference` / `framework` defaults (chat/assistant/generation; Art. 50 transparency)
  - **Minimal risk**: `vector-db`, `self-hosted`, and inference located in `tests`/`scripts`/`tools`/`examples`/`fixtures` path segments
  - Each classification includes `riskReasoning` shown on hover in the dashboard
- [x] User overrides via `.grc/config.yml` `ai_systems:` array — matches by `location` (required) and optional `name` (matches AISystem.sdk); tier/purpose/eu_market all configurable:
  ```yaml
  ai_systems:
    - location: src/server.ts
      name: openai
      risk_tier: minimal
      purpose: "Generate CSS from user prompts"
      eu_market: true
  ```
- [x] Dashboard labels heuristic tiers as `TENTATIVE` and overrides as `★ OVERRIDE`; color-coded by tier (red/orange/yellow/green), with reasoning on hover
- [x] `AISystem` extended with `riskTier`, `riskTierSource` ("heuristic" | "override"), `riskReasoning` (all optional for backward compat with older manifests)
- [x] Verified on this repo — OpenAI + Anthropic both classified as `limited` with correct reasoning
- **GRC concept:** AI risk tiering under EU AI Act Article 6, Annex III
- **Known limitation:** Heuristic relies only on path-name keywords and category. A file named `screening` could be hiring OR spam screening — false positives expected. The override mechanism is the escape hatch.

### Sub-phase C: EU AI Act Framework Mapping — DONE
- [x] New framework file `scanner/frameworks/eu-ai-act.ts` with 13 articles as `AIFrameworkControl` entries and per-article `check(manifest)` / `evidence(manifest)` functions
- [x] Covers Articles 4 (AI literacy), 5 (prohibited), 9 (risk management), 10 (data governance), 11 (technical docs), 12 (record keeping), 13 (transparency), 14 (human oversight), 15 (accuracy/robustness), 27 (FRIA), 50 (transparency to users), 60 (registration), 73 (incident notification)
- [x] Articles grouped by NIST AI RMF phase (Govern/Map/Measure/Manage) to parallel NIST CSF's 5-function structure
- [x] Extended `scanner/frameworks/cross-map.ts` with `AICrossMapping` + `AI_CROSS_MAPPINGS` — each article cross-referenced to NIST AI RMF subcategories and ISO/IEC 42001 Annex A controls
- [x] New report generator `scanner/generators/ai-compliance-report.ts` written to `.grc/ai-compliance-report.md` on every scan (mirrors NIST CSF report layout)
- [x] `evaluateEUAIAct(manifest)`, `calcAIComplianceScore(results)`, and `getAIPhaseScores(results)` exported for dashboard consumption
- [x] Risk-tier-based applicability: high-risk-only articles (9/11/12/13/14/15/27/60/73) show `not-applicable` unless a `high`/`prohibited` system is detected. Article 5 always applies. Article 50 applies at `limited` and above. Articles 27 and 60 additionally require `eu_market: true`.
- [x] `euMarket` field added to `AISystem`; propagated at classifier time from the `ai_systems:` override or defaulted from `jurisdiction` (GDPR → EU market by default)
- **GRC concept:** Framework pluralism — same findings, multiple framework views
- **Known limitation:** Many articles resolve to `partial` with instructional evidence because they are program-level obligations the scanner cannot auto-verify (AI literacy training, runtime logging, registration status). The tool surfaces the obligation; closing it is off-scanner.

### Sub-phase D: AI Policy Generation — DONE
- [x] `ai-usage-policy.hbs` generated whenever any AI system is detected (Article 50 transparency). Lists all systems, data flows, user rights, in-product AI labels, opt-out path.
- [x] `model-card.hbs` rendered once per high-risk / prohibited AI system; output lives at `<output_dir>/model-cards/<provider-sdk>.md`. Covers Article 11 (technical documentation): intended purpose, inputs/outputs, accuracy + robustness claims, human oversight, risk management, data governance, logging.
- [x] `fria.hbs` generated only when at least one AI system is both high-risk (or prohibited) AND `eu_market: true` (Article 27). Template carries placeholder sections for the human to complete and sign before first use.
- [x] IRP addendum: `incident-response-plan.hbs` extended with a conditional Section 11 "AI-Specific Incident Response" covering detection signals (hallucination, bias, prompt injection, provider outage), AI-specific severity matrix, containment steps (kill switch), and Article 73 notification timeline (15-day baseline / 2-day for cyberattacks / 10-day for fatalities).
- [x] Policies ride the Phase 7 deployment flow — written to `config.outputDir` so the action stages + commits them to the PR branch.
- [x] `scanArtifacts` extended with `aiUsagePolicy` / `modelCards` / `fria` fields; each uses `not-applicable` state when the underlying AI scope doesn't warrant the artifact (so dashboard doesn't flag a missing FRIA on a repo with no EU-market high-risk AI).
- [x] Article checks (Art. 11 / 27 / 50) credit the generated artifacts: turn `fail` → `partial` on presence, since the templates contain placeholder sections the deployer must still complete.
- [x] Scan idempotency preserved — a second scan against unchanged inputs produces byte-identical artifact output.
- **GRC concept:** Required AI documentation under EU AI Act

### Sub-phase E: Dashboard Views — DONE
- [x] New "AI" tab per repo with:
  - [x] Table of detected AI systems: provider, SDK, category (color-coded), location
  - [x] Risk Tier column (populated by Sub-phase B with color-coded tiers, tentative/override labels, and hover reasoning)
  - [x] Data Flows section (renders when correlation is populated — currently deferred)
  - [x] EU AI Act Compliance placeholder (populated by Sub-phases B and C)
  - [x] Empty state for repos with no AI detected
  - [x] Route: `GET /ai/:owner/:name`, respects branch dropdown
- [x] EU AI Act obligations per repo — per-article table on AI tab with phase, status, cross-map references
- [x] AI compliance score HP-bar — overall EU score + per-phase HP-bars (Govern/Map/Measure/Manage) on AI tab
- [x] Gaps with evidence — dedicated GAPS table under the AI tab for fail/partial articles
- [x] New top-level "AI SYSTEMS INVENTORY" view at `/inventory` — aggregated across all repos (main/master branch per repo). Client-side filters for tier, provider, repo, and EU-market status. CSV export at `/api/inventory.csv`. Header nav bar links to it from every page.
- [x] "EU AI Act" score card added to the top stats row — shows average AI compliance score across repos that have detected AI systems, with a secondary line counting total detected systems and affected repos.
- [x] `ai-compliance` risk category added to `Risk`. `assessRisks` now emits one `Risk` per failing/partial EU AI Act article, with likelihood/impact derived from the risk tier of the in-scope systems (prohibited → critical; high-risk fail → high; partial on minimal → low). Auto-downgrades when generated artifacts are present.
- [x] Trend chart gains a fourth series: EU AI compliance %, drawn in magenta on the left axis. The series only renders for branches that have had AI systems at some point — repos without AI don't get a noise line at 100%.
- [x] `HistoryEntry` extended with optional `aiScore` and `aiSystemCount`; populated on POST /api/report and on the live Check Production refresh. Older history entries missing the fields are treated as zero-AI.

### Phased Rollout
Recommended build order:
1. **Sub-phase A** (detection) ships first — valuable alone
2. **Sub-phase C** (framework) next — unlocks scoring
3. **Sub-phase E** (dashboard) once there's data to display
4. **Sub-phase D** (policies) — reuses Phase 7 deployment flow
5. **Sub-phase B** (risk classification) can be added incrementally — start with a basic classifier, refine over time

### Honest Concerns
- Scope roughly doubles the project (security compliance + AI compliance)
- Heuristic classification will have false positives (a file named `ai-screening` could be hiring-screening OR spam-screening)
- EU AI Act interpretation is still evolving — avoid overclaiming "AI Act compliant"
- User hasn't fully mastered traditional GRC fundamentals yet — adding AI compliance may dilute learning
- Our own scanner becomes subject to the rules it enforces (good demo opportunity, real obligation)

## Phase 9: GRC Platform Integration — PROPOSED

**Why this direction:** Position the scanner as an evidence source that plugs into existing GRC platforms (Drata, Vanta, Hyperproof) rather than trying to replace them. Our tool is strongest at technical control evidence from code; GRC platforms are strongest at program management, audit workflow, policy lifecycles, and vendor risk. Meeting them at the boundary — structured exports and optional integrations — lets the work flow both directions without competing for scope.

**Design principle: no new action runtime.** We don't want to bloat the action's scan time. Integration work happens via (a) exports the user downloads or (b) on-demand dashboard actions. Automatic push-on-scan is deliberately deferred.

### Sub-phase A: Standard export formats — MVP
- [ ] **SARIF-format output** for security findings (format compatibility only — producing a conformant SARIF file; this does NOT by itself populate GitHub's PR Security tab)
- [ ] **SARIF upload step** in the action — use `github/codeql-action/upload-sarif@v3` (or POST to `/repos/:owner/:repo/code-scanning/sarifs`) so findings actually appear in GitHub's code scanning UI. Requires `security-events: write` in the consuming workflow's permissions block. Must be documented alongside the existing `contents: write` requirement.
- [ ] **OSCAL export** (NIST SP 800-53 / Open Security Controls Assessment Language) — JSON/YAML/XML standard that Drata, Hyperproof, and an increasing number of GRC platforms can ingest
- [ ] **Enhanced JSON export** — structured scan data with all findings, for custom ingestion or scripting
- [ ] **CSV export** — flat finding list for spreadsheet ingestion (audit workpapers, remediation tracking)
- [ ] **Export dropdown on each repo card** — choose format, download file
- [ ] **Org-level export** — aggregated across all scanned repos in one bundle
- [ ] Exports land in `.grc/exports/` when run via CLI; in-browser download from the dashboard
- [ ] No credentials required for downloads; SARIF upload uses `GITHUB_TOKEN` only (no vendor keys)
- **GRC concept:** Structured evidence formats; OSCAL as the emerging interchange standard; SARIF as the de-facto security findings format
- **Known gotcha:** SARIF-on-disk is not the same as findings in the Security tab. Producing the file and uploading it are two separate pieces of work — ship both.

### Sub-phase B: Auditor evidence packaging (was Phase 5 Tier 3)
- [ ] Generate PDF/ZIP evidence package per framework
- [ ] Date-stamped snapshots (auditors need stable dated evidence, not "re-run the scan")
- [ ] Control-by-control walkthrough format
- [ ] Sign-off metadata (control owner, last reviewed, evidence source)
- [ ] Download from dashboard via the export dropdown
- **GRC concept:** Audit evidence packaging, control attestation artifacts

### Sub-phase C: On-demand dashboard publishing — FUTURE
- [ ] Per-repo "Publish to Drata" / "Publish to Vanta" / "Publish to Hyperproof" buttons on the dashboard
- [ ] API credentials stored **in the dashboard's environment/KV** (one config for the whole deployment, not per-consuming-repo)
- [ ] Confirmation dialog showing exactly what will be pushed before submission
- [ ] Retry-friendly on failure, logs per-push history
- [ ] Control ID mapping layer: our NIST CSF IDs → vendor-specific control IDs (hardcoded mappings shipped, user override via config)
- **GRC concept:** Evidence submission workflows, auditor platform integration

### Sub-phase D: Direct vendor API integrations — FUTURE
- [ ] Drata API integration (evidence upload against specific controls)
- [ ] Vanta API integration (custom integration via their platform)
- [ ] Hyperproof API integration (evidence upload + control mapping)
- [ ] Each integration is optional, opt-in per dashboard deployment
- **GRC concept:** Programmatic evidence submission, API integration patterns

### Sub-phase E: Auto-push on scan — FUTURE (deferred)
- [ ] Opt-in via `.grc/config.yml` in the consuming repo
- [ ] Triggers on merge to main (not PRs) by default
- [ ] Credentials live in consuming repo secrets (per-repo, not central)
- [ ] Debounce: only push if meaningful change since last submission
- [ ] **Deliberately deferred** — adds runtime to the action and requires API keys in every consuming repo's secrets. Sub-phases A-D cover most use cases without this complexity.
- **GRC concept:** Continuous compliance automation, evidence freshness tradeoffs

### Control ID Mapping
- [ ] Ship curated mappings for major platforms (NIST CSF → Drata, NIST CSF → Vanta, etc.)
- [ ] User override via `.grc/config.yml` for custom control schemes
- [ ] Document mapping assumptions — where does our reading differ from the platform's?

### API Credential Storage (flagged for future)
- When we implement Sub-phases C-E, credentials will go in:
  - **Sub-phase C (dashboard button)**: Cloudflare Worker secrets on the dashboard deployment (one set per forked/deployed dashboard)
  - **Sub-phase D (vendor APIs)**: same as C
  - **Sub-phase E (auto-push)**: per-consuming-repo GitHub secrets
- Dashboard deployers will set e.g. `DRATA_API_KEY` via `wrangler secret put`
- No credentials stored in manifest.yml, config.yml, or any committed file

### Recommended Sequencing
1. **Sub-phase A** first — exports are the MVP. Useful alone, no credentials, no vendor lock-in
2. **Sub-phase B** (evidence packaging) — builds on A, adds PDF/ZIP formatting
3. **Sub-phase C** (button) — only after there's demand for "I don't want to download and re-upload"
4. **Sub-phase D** (vendor APIs) — only ship integrations the community actually asks for
5. **Sub-phase E** (auto-push) — deferred indefinitely unless there's clear need

### Honest Tradeoffs
- Export-only keeps us out of the "GRC platform" competitive space and positions us as a source. That's the right move given current scope.
- We're betting on OSCAL adoption continuing. If the industry doesn't converge, our OSCAL work is wasted. Mitigate by also shipping JSON/CSV which are format-agnostic.
- Vendor integrations (Sub-phases C-D) are maintenance burden. Each one commits us to tracking their API changes.

---

## Phase 10: Future Enhancements

### GitHub App (natural evolution from the action)
- [ ] Build GitHub App for zero-config install (no workflow file per repo)
- [ ] App receives webhooks, clones repos, runs scans automatically
- [ ] Auto-creates workflow + config files via PR on install (or makes files unnecessary entirely)
- [ ] App credentials allow reading admin APIs (Dependabot alerts, code scanning alerts, secret scanning alerts, deploy keys). Note: core branch protection data now comes via the Rulesets API without admin scope (resolved in Phase 2 Item 6).
- [ ] Multi-org support

### Additional Scanners
- [ ] SBOM generation (CycloneDX JSON format) — natural extension of dependency scanning, meets Executive Order 14028 requirements
- [ ] SAST via Semgrep integration — real static analysis beyond our current secret-regex approach
- [ ] Python dependency scanning (`requirements.txt`, `pyproject.toml`)
- [ ] Go dependency scanning (`go.mod`)
- [ ] Secrets scanner upgrade — integrate TruffleHog or Gitleaks for better coverage than our regex
- [ ] Vulnerability management deep-dive: CVSS scoring, dev vs prod dep distinction, exploitability vs severity, accepted-risk tracking

### Dashboard
- [x] Authentication on API endpoints — POST /api/report verifies a GitHub OIDC JWT and asserts the token's `repository` claim matches the manifest (PR #28). Consumer config is one permission line.
- [ ] Accepted-risk workflow (declare risks as acknowledged in `.grc/config.yml`, dashboard respects and shows as "accepted")
- [ ] Multi-tenant / multi-org support
- [x] Tests — Vitest unit tests cover the pure-logic modules (risk classifier, EU AI Act evaluator + scoring, AI compliance risk generation) plus render-level smoke tests in `scripts/smoke-dashboard.ts`. A full coverage push is still open.
- Note: auditor evidence export moved to Phase 9 Sub-phase B

## Phase 11: Blog Content

- [x] Security headers deep dive (published)
- [x] Dashboard v2 build writeup — covers Phases 5-7 (draft on desktop, extended through Phase 7 work)
- [ ] "How I Applied NIST CSF to a Personal Project"
- [ ] "Risk Register for a Solo Developer"
- [ ] Walk-throughs of policy templates created
- [ ] Lessons from self-auditing your own infrastructure
- [ ] "Vulnerability Management for a One-Person Operation" — CVE scoring, exploitability vs severity, practical vuln management policy
- [ ] AI Compliance writeup (after Phase 8 ships)
- [ ] "Ship GRC evidence to Drata without touching a spreadsheet" — after Phase 9 ships

## Known Issues (Project-Wide)

These cut across all phases and should be addressed opportunistically.

### Unfixed Technical Debt
- [ ] joeeftekhari.com has 1 critical + 3 high CVEs we haven't addressed. We don't use our own tool's output.
- [ ] joeeftekhari.com doesn't yet serve policies at public URLs — files exist in `docs/policies/` but no Express routes to serve them. Once routes exist, user will configure `policy_urls` and Check Production will verify them.
- [x] Unit tests — Vitest covers risk classifier, EU AI Act evaluator + scoring, and AI-compliance risk generation (51 tests). Smoke tests in `scripts/smoke-dashboard.ts` cover render pipelines with both new-shape and old-shape manifests. Broader coverage still welcome but the floor is up.
- [x] CI on every PR — `.github/workflows/ci.yml` runs lint + unit tests + scanner smoke + dashboard render smoke. Catches regressions like the 2026-04-18 outage.
- [x] Lint — Biome configured with correctness + suspicious rules (no style churn). Catches unused imports, shadowed vars, assign-in-conditions, etc. Type-check via `tsc --noEmit` still skipped because of tsconfig/runtime mismatch; tracked.
- [x] Docs — `docs/` cleaned up: `compliance-scope.md` deleted (outdated + duplicated README content), `manifest-spec.md` trimmed to point at `scanner/types.ts` as authoritative, `github-app-badge.md` → `badges.md`, `architecture.md` rewritten to reflect the current Hono/Workers/KV stack (was still referencing Express + Postgres).
- [ ] Deploy workflow uses `sed` for the KV id placeholder in `wrangler.toml` — works but fragile; `ORG_NAME` + `GRC_AUDIENCE` already moved off `sed` onto `wrangler deploy --var` in PR #30. Last `sed` removed would require either an API call to set the KV binding or a script that rewrites the TOML via a proper parser.
- [ ] Monorepo support is poor (scans root only, no per-package awareness)
- [x] Python support tier documented explicitly in README — ("Language coverage" section calls out that Python has partial coverage and Go/Ruby/Java/Rust are essentially unsupported). Fixing the under-coverage is still open but the claim no longer overpromises.
- [ ] CSP auto-generator only catches HTML-embedded CDN imports (Google Analytics) — misses CDN script tags (unpkg, jsdelivr, cdnjs), so output needs manual review. README security-headers report now includes an explicit "CSP caveat" paragraph.

### Unvalidated Claims
- [x] ~~AI layer has never been run with a real API key~~ — validated with OpenAI gpt-4o-mini, all 4 enhancements work (PR #19)
- [x] ~~Open-source setup instructions have never been fork-tested from scratch~~ — dry-ran from a fresh clone (PR #30); found and fixed an ORG_NAME deploy bug in the process.
- [x] ~~"Copy-paste ready" middleware claim overstated~~ — relabelled to "Express Middleware (starter)" in the generated report with an explicit CSP caveat paragraph about dynamic CDNs.
- [x] ~~"Works on any Node/Python/Go repo" claim overstated~~ — README now includes a "Language coverage" section saying exactly what works per language (Node mature, Python partial, Go/Ruby/Java/Rust basic regex only).

## Certification Pairing (recommended for entry-level GRC)
- CompTIA Security+
- CC (ISC2) — free entry-level cert
- CISA (if targeting audit/compliance)
