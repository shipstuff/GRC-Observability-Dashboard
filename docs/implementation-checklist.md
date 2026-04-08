# Implementation Checklist

The single source of truth for the GRC Observability Dashboard roadmap. Each item is both a **learning exercise** (understand the GRC concept) and a **scanner/dashboard feature** (automate detection and reporting).

## Phase 1: Policies & Documentation

### Item 1: Privacy Policy (GDPR, CCPA) — DONE
- [x] Define the template structure (sections, conditional blocks)
- [x] Build the scanner rules for data collection detection (forms, endpoints, cookies, tracking, dependencies)
- [x] Create `.grc/config.yml` schema for static site info
- [x] Generate a real privacy policy for joeeftekhari.com
- [x] Add privacy policy status to manifest schema
- **GRC concept:** Data mapping, lawful basis for processing, data subject rights
- **AI opportunity:** LLM classifies detected form fields as PII categories

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

## Phase 2: Technical Controls

### Item 5: Security Headers
- [ ] Implement: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] Scanner checks response headers from live site (already built)
- [ ] Dashboard shows which headers are present/missing
- **GRC concept:** Defense in depth, OWASP recommendations
- **AI opportunity:** AI suggests CSP directives based on what scripts/resources the site loads

### Item 6: Access Controls
- [ ] Document access control for any admin panel or CMS
- [ ] Scanner checks GitHub branch protection, required reviews (requires GitHub API)
- [ ] Scanner checks for authentication on admin routes
- **GRC concept:** Principle of least privilege, separation of duties

### Item 7: HTTPS Enforcement & Certificate Management
- [x] Verify HTTPS redirect is in place (already built)
- [x] Monitor certificate expiry (already built)
- [x] Scanner checks TLS configuration (already built)
- **GRC concept:** Encryption in transit, certificate lifecycle management

## Phase 3: GRC Artifacts

### Item 8: Risk Assessment
- [ ] Conduct a lightweight risk assessment of joeeftekhari.com
- [ ] Scanner auto-generates risk findings from its checks
- **GRC concept:** Risk identification, qualitative risk analysis, risk appetite
- **AI opportunity:** AI categorizes and prioritizes risks based on context

### Item 9: Incident Response Plan
- [ ] Write an IRP (even for a one-person operation)
- [x] Scanner checks for IRP document existence (already built)
- **GRC concept:** NIST SP 800-61 incident response lifecycle (Prepare, Detect, Contain, Eradicate, Recover, Lessons Learned)

### Item 10: Risk Register
- [ ] Create a risk register from scan findings
- [ ] Document: risk description, likelihood, impact, mitigation, owner, status
- [ ] Dashboard displays risk register data
- **GRC concept:** Risk treatment options (accept, mitigate, transfer, avoid)
- **AI opportunity:** AI scores likelihood/impact based on historical CVE data

### Item 11: Framework Mapping
- [ ] Pick NIST CSF as primary framework
- [ ] Map each scan check to NIST CSF subcategories
- [ ] Dashboard shows framework compliance percentage
- [ ] Cross-map to SOC 2 and ISO 27001 where applicable
- **GRC concept:** Control frameworks, control objectives, evidence collection
- **AI opportunity:** AI suggests which additional controls would have highest compliance impact

## Phase 4: Dashboard Build

### Tier 1: Core Scanner + Dashboard
- [x] Build scanner with universal detection rules
- [x] Define manifest.yml schema (see `docs/manifest-spec.md`)
- [x] Build policy/artifact generators from scan data
- [ ] Build reusable GitHub Action wrapping the scanner
- [ ] Build dashboard API (Express) to receive manifests
- [ ] Build dashboard UI (HTMX) — checklist view per repo
- [ ] Deploy dashboard (Digital Ocean droplet or subdomain of joeeftekhari.com)

### Tier 2: Framework Mapping + Branch Tracking
- [ ] Add NIST CSF mapping to dashboard
- [ ] Add branch comparison view
- [ ] Add trend tracking over time

### Tier 3: Auditor Evidence Export
- [ ] Generate evidence packages per framework
- [ ] AI-powered gap analysis
- [ ] Auto-fix PR generation for remediations

## Phase 5: Blog Content

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
