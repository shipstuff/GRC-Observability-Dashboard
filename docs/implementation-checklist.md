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

### Item 2: Terms of Service — DONE
- [x] Define ToS template structure
- [x] Identify what terms are site-specific vs boilerplate
- [x] Auto-detect services (game, AI tools, contact form) for Description of Service section
- [x] Generate ToS for joeeftekhari.com
- **GRC concept:** Legal agreements, liability limitation, acceptable use

### Item 3: security.txt — DONE
- [x] Generate /.well-known/security.txt following RFC 9116
- [x] Scanner checks for its existence and validity
- [x] Includes required fields (Contact, Expires) and recommended fields (Canonical, Policy, Preferred-Languages)
- **GRC concept:** Vulnerability coordination, responsible disclosure standards

### Item 4: Responsible Vulnerability Disclosure Page — DONE
- [x] Generate disclosure policy with in-scope/out-of-scope sections
- [x] In-scope auto-populated from scan findings
- [x] Out-of-scope lists third-party services with contact links
- [x] Includes safe harbor provisions and response timelines
- [x] Scanner checks for its existence
- **GRC concept:** Coordinated vulnerability disclosure, safe harbor provisions

## Phase 2: Technical Controls — DONE

### Item 5: Security Headers — DONE
- [x] Scanner checks response headers from live site
- [x] Auto-generates security headers report with recommendations
- [x] Generates copy-paste Express middleware and Nginx config
- [x] CSP auto-generated based on detected resources (e.g., Google Analytics domains)
- [ ] Implement headers on joeeftekhari.com (copy middleware from report)
- **GRC concept:** Defense in depth, OWASP recommendations

### Item 6: Access Controls — DONE
- [x] Scanner checks GitHub branch protection via `gh` CLI
- [x] Scanner detects admin/sensitive routes and checks for auth middleware
- [x] Generates access controls report with `gh` CLI remediation commands
- [ ] Implement branch protection on joeeftekhari.com repo
- **GRC concept:** Principle of least privilege, separation of duties

### Item 7: HTTPS Enforcement & Certificate Management — DONE
- [x] Verify HTTPS redirect is in place
- [x] Monitor certificate expiry
- [x] Scanner checks TLS configuration
- **GRC concept:** Encryption in transit, certificate lifecycle management

## Phase 3: GRC Artifacts — DONE

### Item 8: Risk Assessment — DONE
- [x] Auto-generate risk assessment from scan findings
- [x] Likelihood x impact matrix with visual grid
- [x] Framework mappings per risk (NIST CSF, SOC 2, ISO 27001, GDPR)
- [x] Actionable mitigations that cross-reference other reports
- [x] Executive summary with severity counts
- [x] Methodology section
- **GRC concept:** Risk identification, qualitative risk analysis, risk appetite

### Item 9: Incident Response Plan — DONE
- [x] Generate IRP template following NIST SP 800-61 lifecycle
- [x] Scope auto-populated from scan findings (game, third-party services, etc.)
- [x] Contact list includes third-party service contacts with DPA links
- [x] Containment commands specific to the detected stack (pm2, ufw, credential rotation)
- [x] GDPR 72-hour and CCPA breach notification requirements included based on jurisdiction
- [x] Incident log template and annual testing checklist
- [x] Scanner checks for IRP document existence
- **GRC concept:** NIST SP 800-61 incident response lifecycle (Prepare, Detect, Contain, Eradicate, Recover, Lessons Learned)

### Item 10: Risk Register — DONE
- [x] Auto-generated from scan findings (part of risk assessment)
- [x] Each risk has: ID, description, likelihood, impact, severity, mitigation, status, framework mappings
- [x] Structured `Risk[]` array ready for dashboard consumption
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

## Phase 4: AI Enhancement Layer — DONE

Optional module — scanner works fully without AI. If an API key is provided, AI enhances output.

### AI Module Foundation — DONE
- [x] Create `scanner/ai/provider.ts` with provider abstraction (Anthropic, OpenAI)
- [x] Add `ai` section to `.grc/config.yml` schema (enabled, provider)
- [x] API key via environment variable / GitHub secrets (never in config file)
- [x] Graceful degradation — disabled in config: silent skip; enabled without key: warns and skips

### AI-Enhanced Scans — DONE
- [x] PII classification — LLM classifies every form field with GDPR category, confidence, reasoning
- [x] Risk narrative enhancement — AI writes plain-English risk descriptions with business context
- [ ] Context-aware CSP generation — AI fetches page, sees actual resources, generates precise policy
- [ ] Remediation code generation — AI looks at actual codebase patterns and generates specific fixes

### AI-Enhanced Outputs — DONE
- [x] PR comment summarization — AI generates GitHub PR comment summarizing compliance posture
- [x] Gap analysis — AI recommends top 3 highest-impact actions with effort estimates
- [x] AI report output at `.grc/ai-analysis.md`
- [x] PR comment output at `.grc/pr-comment.md` for GitHub Action to post
- [ ] Auto-fix PRs — AI generates remediation PRs for common issues
- [ ] Auditor-friendly summaries — AI translates technical findings into compliance language

## Phase 5: Dashboard Build — DONE

### Tier 1: Core Scanner + Dashboard — DONE
- [x] Build scanner with universal detection rules
- [x] Define manifest.yml schema (see `docs/manifest-spec.md`)
- [x] Build policy/artifact generators from scan data
- [x] Build report generators (security headers, access controls, risk assessment)
- [x] Build GitHub Action (composite action at `action.yml`) wrapping the scanner
- [x] Action tested and working on shipstuff/joeeftekhari.com PR #30
- [x] Artifacts upload (11 reports) and PR commenting working
- [x] README with setup instructions (4 steps, copy-paste)
- [x] Build dashboard API (Express) — `POST /api/report`, `GET /api/repos`, `GET /api/history`
- [x] Build dashboard UI (HTMX) — retro video game theme with CRT scanlines
- [ ] Deploy dashboard to persistent hosting (Digital Ocean droplet or similar)

### Tier 2: Framework Mapping + Branch Tracking — DONE
- [x] NIST CSF tab — per-function HP bars, all 18 controls with pass/fail, SOC 2 + ISO 27001 cross-refs, gaps with evidence
- [x] Branch comparison tab — side-by-side compliance/NIST/vulns/headers with diff vs main
- [x] Trend tracking tab — ASCII bar charts for compliance score, NIST score, and vulnerability count over time
- [x] Historical scan storage (last 500 entries per repo)

### Tier 3: Auditor Evidence Export
- [ ] Generate evidence packages per framework (PDF/ZIP)
- [ ] AI-powered gap analysis in dashboard (depends on Phase 4)
- [ ] Auto-fix PR generation (depends on Phase 4)

## Phase 6: Open Source Readiness

Make the project usable by anyone — fork, self-host, and run against their own org.

### Scanner + Action (already usable)
- [x] Composite GitHub Action works for any public repo
- [x] README with 4-step setup instructions
- [x] Example workflow file at `examples/grc-scan.yml`

### Dashboard Self-Hosting
- [ ] Make org name configurable via env var (remove hardcoded "shipstuff")
- [ ] Add `DASHBOARD_URL` env var to the action so repos know where to POST
- [ ] Add deployment guide (pm2 + nginx, or Docker)
- [ ] Docker Compose file for one-command self-hosting
- [ ] Add authentication to dashboard API (API key validation on POST)

### Documentation
- [ ] Contributing guide
- [ ] How to add new scan rules
- [ ] How to add new policy templates
- [ ] How to add new framework mappings

## Phase 7: Blog Content

Write these as you complete each phase — document what was learned and built:
- [ ] "How I Applied NIST CSF to a Personal Project"
- [ ] "Risk Register for a Solo Developer"
- [ ] Walk-throughs of policy templates created
- [ ] Lessons from self-auditing your own infrastructure
- [ ] Security headers deep dive — what each one does and why it matters

## Certification Pairing (recommended for entry-level GRC)
- CompTIA Security+
- CC (ISC2) — free entry-level cert
- CISA (if targeting audit/compliance)
