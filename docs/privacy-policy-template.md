# Privacy Policy Template Design

This document defines the privacy policy template structure and the scan rules that populate it. This is the pattern we will repeat for every generated compliance artifact.

## Required Sections (GDPR + CCPA)

| # | Section | GDPR Article | CCPA Section | Populated From |
|---|---|---|---|---|
| 1 | Identity & Contact | Art. 13(1)(a) | §1798.100 | Static config (site owner info) |
| 2 | Data Collected | Art. 13(1)(e) | §1798.110 | `manifest.data_collection[].type` |
| 3 | Purpose & Legal Basis | Art. 13(1)(c) | §1798.100 | `manifest.data_collection[].source` + purpose mapping |
| 4 | Data Sharing / Third Parties | Art. 13(1)(e) | §1798.115 | `manifest.third_party_services[]` |
| 5 | Retention Period | Art. 13(2)(a) | — | `manifest.data_collection[].retention` |
| 6 | User Rights | Art. 13(2)(b) | §1798.105-125 | Static (always included) — lists GDPR + CCPA rights |
| 7 | Cookies & Tracking | Art. 13(1)(e) | §1798.100 | Scan for cookie-setting code, analytics scripts |
| 8 | Server Logs | Art. 13(1)(e) | — | Always included (servers inherently log IPs) |
| 9 | Contact for Requests | Art. 13(1)(a) | §1798.130 | Static config (contact email) |
| 10 | Updates to Policy | — | — | Static (always included) — references scan date |

## Template Logic (Pseudocode)

```handlebars
# Privacy Policy for {{site_name}}
**Last updated:** {{scan_date}}
**Generated from compliance scan:** commit {{commit_hash}}

## Who We Are
{{owner_name}} operates {{site_url}}. Contact: {{contact_email}}.

## What Data We Collect

{{#if data_collection}}
We collect the following personal data:

{{#each data_collection}}
### {{capitalize type}}
- **How:** {{source_description}}
- **Purpose:** {{purpose}}
- **Legal basis (GDPR):** {{legal_basis}}
{{/each}}

{{else}}
We do not actively collect personal data through this site.
{{/if}}

## Server Logs
Our server automatically logs IP addresses, browser type, and pages visited.
This is standard for all web servers. Legal basis: legitimate interest (GDPR Art. 6(1)(f)).

{{#if third_party_services}}
## Third-Party Services
We use the following services that may process your data:

{{#each third_party_services}}
- **{{name}}** — {{purpose}}. Data shared: {{join data_shared ", "}}.
  {{#if dpa_url}}[Data Processing Agreement]({{dpa_url}}){{/if}}
{{/each}}
{{/if}}

{{#if cookies}}
## Cookies & Tracking
{{#each cookies}}
- **{{name}}** — {{purpose}}, expires {{expiry}}
{{/each}}
{{else}}
## Cookies
This site does not use cookies for tracking or analytics.
{{/if}}

## Data Retention
{{#each data_collection}}
- **{{capitalize type}}:** {{retention_description}}
{{/each}}
- **Server logs:** Retained for {{log_retention_days}} days.

## Your Rights

### Under GDPR (EU residents)
You have the right to: access your data, rectify inaccuracies, request erasure,
restrict processing, data portability, and object to processing.

### Under CCPA (California residents)
You have the right to: know what data is collected, request deletion,
opt out of data sales (we do not sell data), and non-discrimination for
exercising your rights.

## How to Exercise Your Rights
Contact {{contact_email}} with your request. We will respond within 30 days.

## Changes to This Policy
This policy is auto-generated from our compliance scanning system and updated
on every deployment. Material changes will be noted in our commit history.
```

## What the Scanner Must Detect

To populate this template, the scanner needs to find:

### Data Collection Points
- HTML forms (`<form>`, `<input>` tags) — extract field names
- POST route handlers — what data they accept
- Database models/schemas — what gets persisted
- localStorage/sessionStorage usage
- File upload handlers

### Third-Party Services
- npm packages that are SaaS SDKs (e.g., `resend`, `stripe`, `@sentry/node`)
- Outbound HTTP calls to known service domains
- Script tags loading external JS (analytics, chat widgets, etc.)

### Cookies & Tracking
- `Set-Cookie` headers in server code
- `document.cookie` in client code
- `res.cookie()` calls in Express
- Known analytics/tracking scripts (Google Analytics, Mixpanel, etc.)

### Static Config (not scanned — provided by repo owner)
Each repo provides a `.grc/config.yml` with:
```yaml
site_name: Joe Eftekhari
site_url: https://joeeftekhari.com
owner_name: Joe Eftekhari
contact_email: joe@joeeftekhari.com
log_retention_days: 90
```

## Example: joeeftekhari.com

Based on what we know about the site, the scan would produce:

```yaml
data_collection:
  - type: email
    source: contact-form
    location: src/routes/contact.ts
    processor: resend
    retention: transient
  - type: username
    source: game-input
    location: src/game/index.ts
    processor: self-hosted
    retention: persistent  # needs investigation

third_party_services:
  - name: Resend
    purpose: email delivery
    data_shared: [email, name, message_body]
    dpa_url: https://resend.com/legal/dpa

cookies: []  # none detected
```

This would generate a privacy policy that includes:
- Email collection section (contact form, processed by Resend)
- Username collection section (game, self-hosted)
- Resend as a third-party processor with DPA link
- No cookies section
- Standard server logs disclosure
- GDPR + CCPA rights sections
