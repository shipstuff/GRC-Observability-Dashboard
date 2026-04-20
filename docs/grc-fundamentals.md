# GRC Fundamentals Reference

Quick reference for core GRC concepts as they relate to this project.

## What is GRC?

**Governance** — The rules, policies, and processes an organization follows. "What should we do?"
**Risk** — Identifying what could go wrong and deciding how to handle it. "What could hurt us?"
**Compliance** — Proving you actually follow specific standards or regulations. "Can we prove it?"

## Key Frameworks

### NIST Cybersecurity Framework (CSF) 2.0
Published February 2024 (NIST.CSWP.29). **Six** core functions — the previous five functions, plus `Govern` newly promoted to the organizational core:
1. **Govern (GV)** — Establish and monitor cybersecurity risk management strategy, expectations, and policy (NEW in 2.0)
2. **Identify (ID)** — Know your assets, data, dependencies, and risks
3. **Protect (PR)** — Implement safeguards (identity, access, data security, platform security, training)
4. **Detect (DE)** — Monitor for adverse events
5. **Respond (RS)** — Manage and communicate during incidents
6. **Recover (RC)** — Restore assets and operations after an incident

Subcategory IDs in CSF 2.0 are zero-padded (e.g. `ID.AM-01`, `PR.AA-01`); older `ID.AM-1`-style IDs are CSF 1.1.

### SOC 2
The AICPA's Trust Services Criteria, 2017 edition (revised 2022). Five Trust Services Categories:
1. **Security** — Protection against unauthorized access (mandatory baseline)
2. **Availability** — System is available for operation and use
3. **Processing Integrity** — System processing is complete, valid, accurate
4. **Confidentiality** — Information designated as confidential is protected
5. **Privacy** — Personal information is collected, used, retained properly

Type I = a point-in-time attestation that controls exist and are designed appropriately. Type II = a period-of-time attestation (usually 3-12 months) that controls operated effectively.

### ISO/IEC 27001:2022
International standard for Information Security Management Systems (ISMS), 2022 revision. Annex A lists 93 controls organised into four themes:
- `A.5` Organizational (37 controls)
- `A.6` People (8 controls)
- `A.7` Physical (14 controls)
- `A.8` Technological (34 controls)

Codes use two components (e.g. `A.5.23`, `A.8.9`). The 2013 four-component form (`A.8.1.1`, `A.12.6.1`) is obsolete — the transition ended October 2025.

### GDPR (General Data Protection Regulation)
EU regulation. Key requirements:
- Lawful basis for processing (consent, legitimate interest, contract, etc.)
- Right to access, rectify, erase, port data
- Data Protection Impact Assessments for high-risk processing
- 72-hour breach notification to authorities
- Data Processing Agreements with third parties

### CCPA/CPRA (California Consumer Privacy Act)
California regulation. Key rights:
- Right to know what data is collected
- Right to delete
- Right to opt out of data sales
- Right to non-discrimination

## Key GRC Concepts

**Control** — A safeguard or countermeasure. Can be technical (firewall), administrative (policy), or physical (locked door).

**Risk Register** — A living document listing identified risks with likelihood, impact, owner, and mitigation status.

**Risk Treatment** — Four options: Accept (acknowledge and move on), Mitigate (reduce likelihood/impact), Transfer (insurance, third-party), Avoid (stop doing the risky thing).

**Evidence** — Proof that a control exists and works. Screenshots, logs, exports, scan results.

**Audit** — Formal examination of controls against a framework. Internal (self) or external (third-party).

**Data Controller** — Entity that decides why and how personal data is processed (you, for your site).

**Data Processor** — Entity that processes data on behalf of the controller (Resend, for your email sending).

**DPA (Data Processing Agreement)** — Contract between controller and processor defining data handling obligations.

## Certification Path

Recommended for entry-level GRC:
- **CompTIA Security+** — Foundational security knowledge
- **CC (ISC2)** — Free entry-level cert, covers GRC basics
- **CISA** — If targeting audit/compliance specifically

## Why This Project Matters for Hiring

Hiring managers in GRC value someone who can translate frameworks into real controls. A portfolio showing you've:
1. Built automated compliance scanning
2. Mapped real controls to NIST CSF/SOC 2
3. Generated policies from actual data flows
4. Created a dashboard showing compliance posture

...stands out dramatically over a resume that just lists certifications.
