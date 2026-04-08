# Implementation Checklist

This is the ordered list of work items from GRC-PLAN.md, contextualized within the dashboard architecture. Each item should be implemented as both a **learning exercise** (understand the GRC concept) and a **scanner/dashboard feature** (automate detection and reporting).

## Status: Starting at Item 1

## Phase 1: Policies & Documentation

### Item 1: Privacy Policy (GDPR, CCPA)
- [ ] Define the template structure (sections, conditional blocks)
- [ ] Build the scanner rules for data collection detection
- [ ] Create `.grc/config.yml` schema for static site info
- [ ] Generate a real privacy policy for joeeftekhari.com
- [ ] Add privacy policy status to manifest schema
- **GRC concept:** Data mapping, lawful basis for processing, data subject rights
- **AI opportunity:** LLM classifies detected form fields as PII categories
- **Template:** See `docs/privacy-policy-template.md`

### Item 2: Terms of Service
- [ ] Define ToS template structure
- [ ] Identify what terms are site-specific vs boilerplate
- [ ] Generate ToS for joeeftekhari.com
- **GRC concept:** Legal agreements, liability limitation, acceptable use

### Item 3: security.txt
- [ ] Create /.well-known/security.txt following RFC 9116
- [ ] Scanner checks for its existence and validity
- **GRC concept:** Vulnerability coordination, responsible disclosure standards

### Item 4: Responsible Vulnerability Disclosure Page
- [ ] Create a disclosure policy page
- [ ] Scanner checks for its existence
- **GRC concept:** Coordinated vulnerability disclosure, safe harbor provisions

## Phase 2: Technical Controls

### Item 5: Security Headers
- [ ] Implement: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [ ] Scanner checks response headers from live site
- [ ] Dashboard shows which headers are present/missing
- **GRC concept:** Defense in depth, OWASP recommendations
- **AI opportunity:** AI suggests CSP directives based on what scripts/resources the site loads

### Item 6: Access Controls
- [ ] Document access control for any admin panel or CMS
- [ ] Scanner checks GitHub branch protection, required reviews
- [ ] Scanner checks for authentication on admin routes
- **GRC concept:** Principle of least privilege, separation of duties

### Item 7: HTTPS Enforcement & Certificate Management
- [ ] Verify HTTPS redirect is in place
- [ ] Monitor certificate expiry
- [ ] Scanner checks TLS configuration
- **GRC concept:** Encryption in transit, certificate lifecycle management

## Phase 3: GRC Artifacts

### Item 8: Risk Assessment
- [ ] Conduct a lightweight risk assessment of joeeftekhari.com
- [ ] Publish non-sensitive findings as a blog post
- [ ] Scanner auto-generates risk findings from its checks
- **GRC concept:** Risk identification, qualitative risk analysis, risk appetite
- **AI opportunity:** AI categorizes and prioritizes risks based on context

### Item 9: Incident Response Plan
- [ ] Write an IRP (even for a one-person operation)
- [ ] Scanner checks for IRP document existence
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

## Phase 4: Blog Content

### Item 12-16: Blog Posts
Each blog post documents what was learned and built. Write these as you complete each phase:
- [ ] "How I Applied NIST CSF to a Personal Project"
- [ ] "Risk Register for a Solo Developer"
- [ ] Walk-throughs of policy templates created
- [ ] Lessons from self-auditing your own infrastructure
- [ ] Security headers deep dive — what each one does and why it matters

## Phase 5: Dashboard Build (Parallel Track)

### Tier 1: Core Scanner + Dashboard
- [ ] Build reusable GitHub Action with scanner
- [ ] Define manifest.yml schema (see `docs/manifest-spec.md`)
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
