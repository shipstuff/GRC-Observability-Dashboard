# Compliance Manifest Specification

The manifest is the structured output of the GRC scan. It is the single source of truth that drives both generated policies and the dashboard.

## Format

YAML file committed to each repo at `.grc/manifest.yml`. Auto-generated — never hand-edited.

## Schema

```yaml
# .grc/manifest.yml
repo: your-org/your-site
scan_date: 2026-04-08T12:00:00Z
branch: main
commit: abc123

data_collection:
  - type: email                    # what kind of data
    source: contact-form           # how it's collected
    location: src/routes/contact.ts # where in the code
    processor: resend              # third-party that handles it
    retention: transient           # transient | persistent | unknown

third_party_services:
  - name: Resend
    purpose: email delivery
    data_shared: [email, name, message_body]
    dpa_url: https://resend.com/legal/dpa  # Data Processing Agreement

security_headers:
  csp: missing | present | partial
  hsts: missing | present
  x_frame_options: missing | present
  x_content_type_options: missing | present
  referrer_policy: missing | present
  permissions_policy: missing | present

https:
  enforced: true | false
  cert_expiry: 2026-09-15       # date or null

dependencies:
  critical_vulnerabilities: 0
  high_vulnerabilities: 2
  medium_vulnerabilities: 5
  outdated_packages: 12
  last_audit: 2026-04-08

secrets_scan:
  detected: false
  findings: []                   # list of file:line if detected (redacted)

artifacts:
  privacy_policy: generated | manual | missing
  terms_of_service: generated | manual | missing
  security_txt: present | missing
  vulnerability_disclosure: present | missing
  incident_response_plan: present | missing

access_controls:
  branch_protection: true | false
  required_reviews: 0           # number of required PR reviews
  signed_commits: true | false

backup:
  strategy: none | manual | automated
  last_verified: null            # date or null
```

## How the Manifest Drives Policies

The manifest is consumed by Handlebars (or similar) templates:

```
manifest.yml + templates/privacy-policy.hbs → public/privacy-policy.html
manifest.yml + templates/terms-of-service.hbs → public/terms.html
```

Template logic example: "IF the manifest lists email collection, include the email section with the processor name filled in." No data collection → that section doesn't appear.

## How the Manifest Feeds the Dashboard

The GitHub Action POSTs the manifest to the dashboard API:

```
manifest.yml → POST https://grc-dashboard.joeeftekhari.com/api/report
```

The dashboard stores historical manifests to enable trend tracking and branch comparison.
