# Implementation Checklist

The single source of truth for the GRC Observability Dashboard roadmap. Each item is both a **learning exercise** (understand the GRC concept) and a **scanner/dashboard feature** (automate detection and reporting).

## Phase 1: Policies & Documentation — DONE

### Item 1: Privacy Policy (GDPR, CCPA) — DONE
- [x] Define the template structure (sections, conditional blocks)
- [x] Build the scanner rules for data collection detection (forms, endpoints, cookies, tracking, dependencies)
- [x] Create `.grc/config.yml` schema for static site info
- [x] Generate a real privacy policy for joeeftekhari.com
- [x] Add privacy policy status to manifest schema
- **GRC concept:** Data mapping, lawful basis for processing, data subject rights
- **Known limitation:** Generated but never deployed to the live site. See Phase 7.

### Item 2: Terms of Service — DONE
- [x] Define ToS template structure
- [x] Identify what terms are site-specific vs boilerplate
- [x] Auto-detect services (game, AI tools, contact form) for Description of Service section
- [x] Generate ToS for joeeftekhari.com
- **GRC concept:** Legal agreements, liability limitation, acceptable use
- **Known limitation:** Generated but never deployed. See Phase 7.

### Item 3: security.txt — DONE
- [x] Generate /.well-known/security.txt following RFC 9116
- [x] Scanner checks for its existence and validity
- [x] Includes required fields (Contact, Expires) and recommended fields (Canonical, Policy, Preferred-Languages)
- **GRC concept:** Vulnerability coordination, responsible disclosure standards
- **Known limitation:** Generated but never deployed. See Phase 7.

### Item 4: Responsible Vulnerability Disclosure Page — DONE
- [x] Generate disclosure policy with in-scope/out-of-scope sections
- [x] In-scope auto-populated from scan findings
- [x] Out-of-scope lists third-party services with contact links
- [x] Includes safe harbor provisions and response timelines
- [x] Scanner checks for its existence
- **GRC concept:** Coordinated vulnerability disclosure, safe harbor provisions
- **Known limitation:** Generated but never deployed. See Phase 7.

## Phase 2: Technical Controls — DONE

### Item 5: Security Headers — DONE
- [x] Scanner checks response headers from live site
- [x] Auto-generates security headers report with recommendations
- [x] Generates copy-paste Express middleware and Nginx config
- [x] CSP auto-generated based on detected resources (e.g., Google Analytics domains)
- [x] Implemented headers on joeeftekhari.com (0/6 → 6/6)
- **GRC concept:** Defense in depth, OWASP recommendations
- **Known limitation:** CSP generator missed non-analytics CDNs (unpkg, jsdelivr, cdnjs). Manual fix was required. "Copy-paste ready" claim is overstated.

### Item 6: Access Controls — DONE
- [x] Scanner detects admin/sensitive routes and checks for auth middleware
- [x] Generates access controls report with remediation commands
- [x] Scanner uses non-admin GitHub API (`GET /branches/main` with `protected: true/false`)
- [x] Attempts detailed rules API as bonus, silently falls back if admin scope unavailable
- [x] Enabled branch protection on joeeftekhari.com main
- **GRC concept:** Principle of least privilege, separation of duties
- **Known limitation:** Without admin scope, we only get the boolean. Required reviews count and signed commits show as unknown. Full detail requires a GitHub App (see Phase 9).

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

## Phase 4: AI Enhancement Layer — BUILT, NOT VALIDATED

Optional module — scanner works fully without AI. If an API key is provided, AI enhances output.

### AI Module Foundation — DONE
- [x] Create `scanner/ai/provider.ts` with provider abstraction (Anthropic, OpenAI)
- [x] Add `ai` section to `.grc/config.yml` schema (enabled, provider)
- [x] API key via environment variable / GitHub secrets (never in config file)
- [x] Graceful degradation — disabled in config: silent skip; enabled without key: warns and skips

### AI-Enhanced Scans — CODE EXISTS, OUTPUT UNVALIDATED
- [x] PII classification — LLM classifies every form field with GDPR category, confidence, reasoning
- [x] Risk narrative enhancement — AI writes plain-English risk descriptions with business context
- [ ] **Validate AI output with a real API key** — prompts are untested, output quality unknown
- [ ] Context-aware CSP generation — AI fetches page, sees actual resources, generates precise policy
- [ ] Remediation code generation — AI looks at actual codebase patterns and generates specific fixes

### AI-Enhanced Outputs — CODE EXISTS, OUTPUT UNVALIDATED
- [x] PR comment summarization — AI generates GitHub PR comment summarizing compliance posture
- [x] Gap analysis — AI recommends top 3 highest-impact actions with effort estimates
- [x] AI report output at `.grc/ai-analysis.md`
- [x] PR comment output at `.grc/pr-comment.md` for GitHub Action to post
- [ ] **Run end-to-end with real API key and review actual output** — blocking task before relying on this layer
- [ ] Auto-fix PRs — AI generates remediation PRs for common issues
- [ ] Auditor-friendly summaries — AI translates technical findings into compliance language

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

### Tier 3: Auditor Evidence Export
- [ ] Generate evidence packages per framework (PDF/ZIP)
- [ ] AI-powered gap analysis in dashboard (depends on Phase 4 validation)
- [ ] Auto-fix PR generation (depends on Phase 4 validation)

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
- [ ] **Validate the fork path end-to-end** — follow the README from a fresh fork and document broken steps
- [ ] Add authentication to dashboard API (API key validation on POST)

### Documentation
- [ ] Contributing guide
- [ ] How to add new scan rules
- [ ] How to add new policy templates

## Phase 7: Policy Deployment Flow — PROPOSED, NOT STARTED

**Why this is the immediate next step:** The scanner generates policies into `.grc/` (gitignored), so they never reach the live site. The artifact scanner then reports them as missing. This is the single largest correctness gap in the project.

### The Flow
- [ ] Add `output_dir` to `.grc/config.yml` (default `docs/policies/`)
- [ ] On PR scans, action compares generated policies to files in `output_dir`
- [ ] If they differ, action commits the generated files to the PR's feature branch
- [ ] `security.txt` specifically goes to `.well-known/security.txt` regardless of output_dir
- [ ] Artifact scanner checks `output_dir` instead of guessing paths
- [ ] On merge to main, no commits happen — policies merge along with the feature PR

### Required Changes
- [ ] Consuming repo workflow needs `contents: write` permission (was `contents: read`)
- [ ] Action uses "grc-bot" git identity for commits
- [ ] Idempotency check: only commit if generated files differ from what's in the repo (prevents infinite re-trigger loop)
- [ ] Update README to document the new permission and behavior

### Tradeoffs
- Bot commits in user PRs may be surprising — make them clearly attributed
- Attribution muddiness for auditors — git blame shows bot for policy content
- Action now writes to user code, not just reads — some orgs restrict this

## Phase 8: AI Compliance Layer — PROPOSED, NOT STARTED

**Why this direction:** The EU AI Act becomes enforceable August 2026 with fines up to €35M / 7% global turnover. The scanner already detects AI SDK usage via dependency scanning but does nothing AI-compliance-specific with those findings. This phase turns "security compliance scanner" into "security + AI compliance scanner."

**Our own meta-obligation:** The scanner uses Anthropic/OpenAI in its AI layer. That makes the dashboard itself an "AI system" under the EU AI Act. When we ship this, the scanner should scan itself and produce its own AI compliance documentation.

### Sub-phase A: AI System Detection
- [ ] New scan rule `scanner/rules/ai-systems.ts`
- [ ] Detect SDK imports: `openai`, `@anthropic-ai/sdk`, `cohere-ai`, `@google/generative-ai`, `@huggingface/inference`
- [ ] Detect framework imports: `langchain`, `llamaindex`, `ai` (Vercel AI SDK), `@langchain/core`
- [ ] Detect self-hosted indicators: `ollama`, `vllm`, `transformers`, `ctransformers`
- [ ] Detect ML training libraries: `tensorflow`, `pytorch`, `sklearn` (signals training pipeline, not just inference)
- [ ] Detect vector DB usage: `pinecone`, `weaviate`, `chromadb`, `qdrant` (signals RAG)
- [ ] Detect outbound API calls: `api.openai.com`, `api.anthropic.com`, etc.
- [ ] Correlate with existing `forms.ts` and `endpoints.ts` output — identify what user data flows to each AI system
- [ ] Add `aiSystems: AISystem[]` field to manifest schema
- **GRC concept:** AI inventory, data flow mapping for AI

### Sub-phase B: AI Risk Classification
- [ ] Heuristic classifier mapping context signals to EU AI Act risk tiers:
  - **Prohibited**: social scoring keywords, biometric ID + real-time context
  - **High-risk**: employment/hiring, credit/financial decisions, healthcare, education/scoring, critical infrastructure
  - **Limited risk**: chat/assistant/support without autonomous decisions, user-facing content generation
  - **Minimal risk**: code tooling, dev assistance, internal-only analytics
- [ ] Allow user overrides via `.grc/config.yml`:
  ```yaml
  ai_systems:
    - location: src/server.ts
      name: style-generator
      risk_tier: minimal
      purpose: "Generate CSS from user prompts"
      eu_market: true
  ```
- [ ] Dashboard always shows classifications as tentative + displays override mechanism
- **GRC concept:** AI risk tiering under EU AI Act Article 6, Annex III

### Sub-phase C: EU AI Act Framework Mapping
- [ ] New framework file `scanner/frameworks/eu-ai-act.ts` with articles mapped to scan findings
- [ ] Cover Articles 4 (AI literacy), 5 (prohibited), 9 (risk management), 10 (data governance), 11 (technical docs), 12 (record keeping), 13 (transparency), 14 (human oversight), 15 (accuracy/robustness), 27 (FRIA), 50 (transparency to users), 60 (registration), 73 (incident notification)
- [ ] Extend `frameworks/cross-map.ts` with NIST AI RMF (Govern/Map/Measure/Manage) cross-references
- [ ] Extend cross-map with ISO/IEC 42001 equivalents
- [ ] New report generator `generators/ai-compliance-report.md` following the same pattern as NIST CSF report
- [ ] Add AI compliance score calculation to summary
- **GRC concept:** Framework pluralism — same findings, multiple framework views

### Sub-phase D: AI Policy Generation
- [ ] `ai-usage-policy.hbs` — required by Article 50 for user-facing AI
- [ ] `model-card.hbs` — one per detected AI system, required by Article 11 for high-risk
- [ ] `fria.hbs` — Fundamental Rights Impact Assessment, only generated if risk_tier: high AND eu_market: true (Article 27)
- [ ] IRP addendum — extend existing IRP template with AI-specific scenarios (model failure, hallucination, regulatory notification per Article 73)
- [ ] Policies ride the same deployment mechanism as Phase 7 (committed to PR branch at output_dir)
- **GRC concept:** Required AI documentation under EU AI Act

### Sub-phase E: Dashboard Views
- [ ] New "AI COMPLIANCE" tab per repo
  - Table of detected AI systems: provider, location, risk tier, data shared
  - EU AI Act obligations for this repo
  - Compliance score (same HP-bar pattern)
  - Gaps with evidence
- [ ] New top-level "AI SYSTEMS INVENTORY" view — aggregated across all repos in the dashboard
  - Filterable by risk tier, provider, repo
  - Maps to Article 60 (EU database registration for high-risk AI)
  - Export format for auditor inventory requirements
- [ ] Add "AI SCORE" card to the top stats row on main dashboard
- [ ] New risk category `ai-compliance` in risk assessment with auto-generated risks like:
  - "High-risk AI without FRIA"
  - "User-facing AI without transparency notice"
  - "AI usage without audit logging"
  - "Prohibited AI practice detected" (critical)

### Phased Rollout
Recommended build order:
1. **Sub-phase A** (detection) ships first — valuable alone
2. **Sub-phase C** (framework) next — unlocks scoring
3. **Sub-phase E** (dashboard) once there's data to display
4. **Sub-phase D** (policies) once Phase 7 (policy deployment flow) is working
5. **Sub-phase B** (risk classification) can be added incrementally — start with a basic classifier, refine over time

### Honest Concerns
- Scope roughly doubles the project (security compliance + AI compliance)
- Heuristic classification will have false positives (a file named `ai-screening` could be hiring-screening OR spam-screening)
- EU AI Act interpretation is still evolving — avoid overclaiming "AI Act compliant"
- User hasn't fully mastered traditional GRC fundamentals yet — adding AI compliance may dilute learning
- Our own scanner becomes subject to the rules it enforces (good demo opportunity, real obligation)

## Phase 9: Future Enhancements

### GitHub App (natural evolution from the action)
- [ ] Build GitHub App for zero-config install (no workflow file per repo)
- [ ] App receives webhooks, clones repos, runs scans automatically
- [ ] Auto-creates workflow + config files via PR on install (or makes files unnecessary entirely)
- [ ] App credentials allow reading admin APIs (full branch protection rules, Dependabot alerts, code scanning alerts, secret scanning alerts, deploy keys)
- [ ] Multi-org support

### Additional Scanners
- [ ] SBOM generation (CycloneDX JSON format) — natural extension of dependency scanning, meets Executive Order 14028 requirements
- [ ] SAST via Semgrep integration — real static analysis beyond our current secret-regex approach
- [ ] Python dependency scanning (`requirements.txt`, `pyproject.toml`)
- [ ] Go dependency scanning (`go.mod`)
- [ ] Secrets scanner upgrade — integrate TruffleHog or Gitleaks for better coverage than our regex

### Dashboard
- [ ] Authentication on API endpoints (API key validation on POST)
- [ ] Auditor evidence export (PDF/ZIP per framework)
- [ ] Accepted-risk workflow (declare risks as acknowledged in `.grc/config.yml`, dashboard respects and shows as "accepted")
- [ ] Multi-tenant / multi-org support
- [ ] Tests — none currently exist

## Phase 10: Blog Content

- [x] Security headers deep dive (published)
- [x] Dashboard v2 build writeup (drafted, on desktop)
- [ ] "How I Applied NIST CSF to a Personal Project"
- [ ] "Risk Register for a Solo Developer"
- [ ] Walk-throughs of policy templates created
- [ ] Lessons from self-auditing your own infrastructure
- [ ] "Vulnerability Management for a One-Person Operation" — CVE scoring, exploitability vs severity, practical vuln management policy

## Known Issues (Project-Wide)

These cut across all phases and should be addressed opportunistically.

### Unfixed Technical Debt
- [ ] joeeftekhari.com has 1 critical + 3 high CVEs we haven't addressed. We don't use our own tool's output.
- [ ] No tests exist anywhere in the project
- [ ] No CI beyond deploy (no lint, no type-check)
- [ ] Documentation in `docs/` has overlapping content across files
- [ ] Deploy workflow uses fragile `sed` for placeholder injection
- [ ] Monorepo support is poor (scans root only, no per-package awareness)
- [ ] Python support is placeholder-only; Go/Ruby/Java/Rust essentially unsupported

### Unvalidated Claims
- [ ] AI layer has never been run with a real API key
- [ ] Open-source setup instructions have never been fork-tested from scratch
- [ ] "Copy-paste ready" middleware claim overstated (CSP required manual fix)
- [ ] "Works on any Node/Python/Go repo" claim overstated (Node works, others are placeholder)

## Certification Pairing (recommended for entry-level GRC)
- CompTIA Security+
- CC (ISC2) — free entry-level cert
- CISA (if targeting audit/compliance)
