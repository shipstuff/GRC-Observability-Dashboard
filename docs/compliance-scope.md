# Compliance Scope — What the Dashboard Tracks

## The Three Pillars of GRC

### Governance (policies, rules, oversight)

| Artifact | Purpose | How We Generate/Detect It |
|---|---|---|
| Privacy Policy | Legal requirement for data-collecting sites | Auto-generated from data collection scan (GDPR Art. 13, CCPA §1798.100) |
| Terms of Service | Defines legal relationship with users | Template + site-specific terms from manifest |
| Acceptable Use Policy | What users can/can't do on your platform | Template-driven |
| Data Retention Policy | How long you keep data, when you delete it | Scan DB schemas, storage configs |
| Incident Response Plan | What you do when something goes wrong | Check for file existence (e.g., docs/irp.md) |
| Change Management Policy | How changes get reviewed before deploy | Check for PR requirements, branch protection |
| Access Control Policy | Who has access to what | Scan GitHub org permissions, SSH keys |
| security.txt | Standardized security contact info | Check for /.well-known/security.txt |
| Vulnerability Disclosure | How to report security issues | Check for disclosure page/policy |

### Risk (what could go wrong, how bad, what you're doing about it)

| Check | Purpose | How We Detect It |
|---|---|---|
| Risk Register | Living document of identified risks | Auto-generated from scan findings |
| Vulnerability Management | Known CVEs in dependencies | `npm audit`, `trivy`, `dependabot` |
| Threat Modeling | Attack surface analysis | AI-assisted — analyze routes, inputs, auth |
| Business Continuity | Recovery capability | Check for backup configs, redundancy |
| Third-Party Risk | Vendor/dependency trustworthiness | Scan for third-party services, check SOC 2 status |
| Certificate Monitoring | TLS cert expiry | Check cert expiry dates |
| Secrets in Code | Leaked credentials | Pattern-based scanning |

### Compliance (proving you meet specific frameworks)

| Framework | Who Cares | What It Requires |
|---|---|---|
| **NIST CSF** | US government, enterprise clients | 5 functions: Identify, Protect, Detect, Respond, Recover |
| **SOC 2** | SaaS companies, B2B | Trust principles: Security, Availability, Processing Integrity, Confidentiality, Privacy |
| **ISO 27001** | International, enterprise | ~93 controls across 4 domains |
| **GDPR** | Anyone with EU users | Data protection, consent, breach notification |
| **CCPA/CPRA** | Anyone with California users | Consumer data rights |
| **PCI DSS** | Anyone handling payment data | Card data security (not relevant unless handling payments) |
| **HIPAA** | Healthcare data | Not relevant unless handling health info |

**Key insight:** These frameworks overlap massively. A security header check satisfies controls in NIST CSF, SOC 2, AND ISO 27001 simultaneously. The dashboard maps each scan result to every framework it satisfies.

## Dashboard Views

### Per-Repo View
```
Repository: example.com
Branch: main
Last Scan: 2026-04-08

GOVERNANCE ARTIFACTS
├── Privacy Policy              ✅  Auto-generated, current
├── Terms of Service            ✅  Auto-generated, current
├── security.txt                ✅  Present
├── Vulnerability Disclosure    ❌  Missing
├── Incident Response Plan      ✅  Present at /docs/irp.md
└── Change Management           ✅  Branch protection enabled

RISK POSTURE
├── Dependencies                ⚠️  2 high vulns (express 4.x, lodash)
├── Secrets in Code             ✅  None detected
├── TLS Certificate             ✅  Valid, expires 2026-09-15
├── Security Headers            ⚠️  3/6 present
├── Third-Party Processors      ✅  1 identified (Resend — DPA on file)
└── Backup Configuration        ❌  No backup strategy detected

FRAMEWORK MAPPING
├── NIST CSF                    72%  ██████████░░░░
│   ├── Identify                90%
│   ├── Protect                 65%
│   ├── Detect                  40%
│   ├── Respond                 80%
│   └── Recover                 30%
├── SOC 2 (Type I)              68%  █████████░░░░░
└── GDPR                        85%  ████████████░░
```

### Branch Comparison (Killer Feature)
If someone adds a form on a feature branch, the scan catches it and flags the privacy policy as stale BEFORE it hits production. The PR can't merge until compliance is green. This is shift-left compliance.

### Auditor Evidence Export (Tier 3)
```
📦 Audit Evidence Package — SOC 2 Type I
   Generated: 2026-04-08
   Scope: your organization

   CC6.1 — Logical Access Controls
   ├── Evidence: GitHub branch protection rules (API export)
   ├── Evidence: SSH key inventory from org settings
   └── Status: SATISFIED

   CC6.6 — Security Measures Against Threats
   ├── Evidence: Dependency scan results (0 critical, 2 high)
   ├── Evidence: Security header configuration
   └── Status: PARTIAL — remediation plan attached
```

This is what Drata and Vanta charge $15-30k/year for.
