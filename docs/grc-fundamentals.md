# GRC Fundamentals Reference

Quick reference for core GRC concepts as they relate to this project.

## What is GRC?

**Governance** — The rules, policies, and processes an organization follows. "What should we do?"
**Risk** — Identifying what could go wrong and deciding how to handle it. "What could hurt us?"
**Compliance** — Proving you actually follow specific standards or regulations. "Can we prove it?"

## Key Frameworks

### NIST Cybersecurity Framework (CSF)
Five core functions:
1. **Identify** — Know your assets, data, and risks
2. **Protect** — Implement safeguards (access controls, encryption, training)
3. **Detect** — Monitor for anomalies and incidents
4. **Respond** — Have a plan for when incidents occur
5. **Recover** — Restore capabilities after an incident

### SOC 2
Five Trust Service Criteria:
1. **Security** — Protection against unauthorized access
2. **Availability** — System is available for operation and use
3. **Processing Integrity** — System processing is complete, valid, accurate
4. **Confidentiality** — Information designated as confidential is protected
5. **Privacy** — Personal information is collected, used, retained properly

Type I = controls exist at a point in time. Type II = controls work over a period (usually 6-12 months).

### ISO 27001
International standard for Information Security Management Systems (ISMS). Has ~93 controls across:
- Organizational controls
- People controls
- Physical controls
- Technological controls

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
