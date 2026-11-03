# All checks

Every check ends as `pass`, `warn`, `fail`, `info` or `skip`. `fail` means rechtzeitig is sure. `warn` means a pattern matched that a person should look at. `info` lists things to judge yourself, and `skip` means the check does not apply.

The severity says how much a finding matters: `critical`, `high`, `medium`, `low` or `info`. Every rule has a fixed id (`LEG-DE-IMP-001`), so you can refer to it in tickets. The link under each id opens the rule's folder: `rule.yml` (metadata), `check.ts` (detection), `test.ts` and `fixtures/` (examples that pass and fail).

Website checks run when you give a URL. Repository checks run when the workflow checks out your repository first. Lockfiles read: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `composer.lock`, `pubspec.lock`, `Cargo.lock`, `uv.lock`, `poetry.lock`, `requirements*.txt`, `go.mod`.

<!-- checks:start -->
### Legal

| Rule | Severity | What | How it is checked | Law |
|---|---|---|---|---|
| **LEG-DE-BTN-001**<br>[`legal/cancellation-button`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/cancellation-button) | high | Cancellation button for subscriptions | Finds a link labeled "Verträge hier kündigen" (`lang/*.yml` `cancel`) on the start page and "jetzt kündigen" on its target page. Only with `subscriptions: true`. | § 312k BGB (German Civil Code) |
| **LEG-EU-DSE-003**<br>[`legal/form-privacy-notice`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/form-privacy-notice) | medium | Forms link to the privacy policy | For every form with email, name, phone or address fields, looks for a privacy link or wording inside the form or its container. Ignores login forms. | Art. 13(1) GDPR |
| **LEG-DE-IMP-002**<br>[`legal/imprint-details`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/imprint-details) | high | Imprint contains the required details | Searches the imprint text for email, phone or contact form, German postcode, VAT ID and register number. | § 5(1) DDG |
| **LEG-DE-IMP-001**<br>[`legal/imprint`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/imprint) | high | Imprint is linked and reachable | Finds the imprint link on the start page (`imprint`), loads it and checks HTTP status and that it has text. | § 5 DDG (German Digital Services Act) |
| **LEG-DE-IMP-003**<br>[`legal/links-on-all-pages`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/links-on-all-pages) | medium | Imprint and privacy policy are linked on every page | Looks for imprint and privacy links on every visited page of the site. | § 5 DDG, Art. 12 GDPR |
| **LEG-EU-ODR-001**<br>[`legal/odr-link`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/odr-link) | medium | No link to the closed EU dispute platform | Looks for links to or mentions of ec.europa.eu/consumers/odr on every visited page. | Regulation (EU) 2024/3228 |
| **LEG-EU-DSE-002**<br>[`legal/privacy-policy-details`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/privacy-policy-details) | medium | Privacy policy covers the required topics | Searches the privacy policy for 11 topics (`controller`, `storage_period`, `right_*` ... in `lang/*.yml`). | Art. 13 GDPR |
| **LEG-EU-DSE-001**<br>[`legal/privacy-policy`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/privacy-policy) | high | Privacy policy is linked and reachable | Finds the privacy link on the start page (`privacy`), loads it and checks HTTP status and that it has text. | Art. 12, 13 GDPR |
| **LEG-DE-BTN-002**<br>[`legal/withdrawal-button`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/legal/withdrawal-button) | high | Withdrawal button for online contracts | Finds a link labeled "Vertrag widerrufen" (`withdraw`) on the start page and "Widerruf bestätigen" on its target page. Only with `sales: true`. | § 356a BGB (German Civil Code, since 19 June 2026) |

### Privacy and consent

| Rule | Severity | What | How it is checked | Law |
|---|---|---|---|---|
| **LEG-EU-CNS-004**<br>[`privacy/consent-preselected`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/privacy/consent-preselected) | high | Optional cookie categories are not preselected | Finds ticked, enabled checkboxes whose label is an optional category (`consent_optional`), also in shadow roots. | § 25 TDDDG, ECJ C-673/17 (Planet49) |
| **LEG-EU-CNS-003**<br>[`privacy/consent-reject`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/privacy/consent-reject) | high | Consent banner can be rejected on the first layer | In dialogs, cookie containers and shadow roots of the start page, looks for an accept button (`consent_accept`) without a reject button (`consent_reject`). | § 25 TDDDG, Art. 7(3) GDPR |
| **LEG-EU-CNS-002**<br>[`privacy/cookies-before-consent`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/privacy/cookies-before-consent) | high | No cookies before consent | Lists cookies and localStorage set while loading the site without clicks; matches names against `data/third-parties.yml`. | § 25 TDDDG (German Telecommunications Digital Services Data Protection Act) |
| **LEG-EU-DSE-005**<br>[`privacy/third-country`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/privacy/third-country) | medium | Privacy policy names transfers outside the EU | Gets the country of each third-party host (`data/third-parties.yml`, or IPinfo with a token) and, for countries outside the EU/EEA, looks for `third_country` wording in the privacy policy. | Art. 13(1)(f), Art. 44 ff. GDPR |
| **LEG-EU-CNS-001**<br>[`privacy/third-parties-before-consent`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/privacy/third-parties-before-consent) | high | No third-party servers before consent | Records every request to another site while loading pages without clicks; `consent: required` vendors fail, others warn. | Art. 6(1) GDPR, § 25 TDDDG |
| **LEG-EU-DSE-004**<br>[`privacy/vendors-in-privacy-policy`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/privacy/vendors-in-privacy-policy) | medium | Privacy policy names the services the site uses | For every contacted third-party service, looks for its name (`names` in `data/third-parties.yml`) in the privacy policy. | Art. 13(1)(e) GDPR |

### Security

| Rule | Severity | What | How it is checked | Law |
|---|---|---|---|---|
| **SEC-HDR-002**<br>[`security/cookie-flags`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/cookie-flags) | medium | Cookies use secure flags | Checks Secure on every cookie (HTTPS sites) and HttpOnly on session cookies set without login. | Art. 32 GDPR |
| **SEC-DNS-001**<br>[`security/email-dns`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/email-dns) | medium | Domain is protected against email spoofing | Reads the SPF TXT record of the domain and the DMARC record at `_dmarc.`; flags missing ones and `p=none`. | Art. 32 GDPR |
| **SEC-EXP-002**<br>[`security/error-disclosure`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/error-disclosure) | medium | Error pages reveal no internals | Requests the error paths from `data/probes.yml` and searches the answers for stack traces, server paths and version headers. | Art. 32 GDPR |
| **SEC-EXP-001**<br>[`security/exposed-files`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/exposed-files) | critical | No private files are public | Requests the file paths from `data/probes.yml`; a 200 whose body matches `expect` fails. | Art. 32 GDPR |
| **SEC-HDR-001**<br>[`security/headers`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/headers) | low | Security headers are set | Reads the response headers of the start page: HSTS, CSP, X-Content-Type-Options, Referrer-Policy, frame protection. | Art. 32 GDPR |
| **SEC-DNS-002**<br>[`security/host-variants`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/host-variants) | low | www and non-www addresses both work | Requests the domain with `www.` added or removed and follows redirects. | Art. 32 GDPR |
| **SEC-TLS-001**<br>[`security/https`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/https) | high | Site uses HTTPS | Checks that the start page is HTTPS and that plain `http://` redirects to HTTPS. | Art. 32 GDPR |
| **SEC-TLS-003**<br>[`security/mixed-content`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/mixed-content) | medium | No unencrypted resources on HTTPS pages | Lists `http://` requests made by pages of an HTTPS site. | Art. 32 GDPR |
| **SEC-TLS-002**<br>[`security/tls`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/security/tls) | high | TLS certificate is valid and current | Opens a TLS connection to the host and reads protocol, trust and expiry date of the certificate. | Art. 32 GDPR |

### Sustainability

| Rule | Severity | What | How it is checked | Law |
|---|---|---|---|---|
| **SUS-JS-002**<br>[`sustainability/content-without-js`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/sustainability/content-without-js) | low | Start page shows content without JavaScript | Compares the visible text of the start page with JavaScript off and on. |  |
| **SUS-JS-001**<br>[`sustainability/legal-pages-without-js`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/sustainability/legal-pages-without-js) | medium | Imprint and privacy policy work without JavaScript | Checks that imprint and privacy links exist with JavaScript off and that their pages show text without it. | § 5 DDG (easily recognizable, directly accessible) |

### Accessibility

| Rule | Severity | What | How it is checked | Law |
|---|---|---|---|---|
| **A11Y-LANG-001**<br>[`accessibility/page-language`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/accessibility/page-language) | low | Page declares its language | Reads `<html lang>` of the start page and compares it with the chosen language. | WCAG 2.2 success criterion 3.1.1 (BFSG) |

### Repository

| Rule | Severity | What | How it is checked | Law |
|---|---|---|---|---|
| **SEC-DEPS-005**<br>[`repo/actions-pinning`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/actions-pinning) | low | GitHub Actions are pinned to a commit | Reads `uses:` lines in `.github/workflows/*.yml` and lists actions not pinned to a 40-character commit SHA. | CRA Annex I (supply chain) |
| **SEC-DBAI-001**<br>[`repo/database-rules`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/database-rules) | critical | Database rules do not open data to everyone | Compares `create table` with `enable row level security` in `supabase/**/*.sql`; looks for `if true` in Firebase rules. | Art. 32 GDPR |
| **SEC-DEPS-003**<br>[`repo/dependency-updates`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/dependency-updates) | medium | Dependency updates are automated | Looks for `.github/dependabot.yml` (and which ecosystems it covers), Renovate config, or scanners in workflows. | CRA Annex I Part II, Art. 32 GDPR |
| **SEC-SECRETS-002**<br>[`repo/env-files`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/env-files) | high | .env files stay out of git | Lists committed `.env*` files (except templates and fixtures) and checks that `.gitignore` ignores `.env`. | Art. 32 GDPR |
| **LEG-DE-LIC-001**<br>[`repo/licenses`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/licenses) | medium | Dependency licenses fit the project | Compares licenses from npm and Composer lockfiles with the project license (package.json, composer.json or LICENSE). | §§ 31, 69c UrhG (German Copyright Act) |
| **SEC-DEPS-002**<br>[`repo/sbom`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/sbom) | low | Dependencies are locked and listed in an SBOM | Reads all lockfiles (`src/repo/lockfiles.ts`), writes `rechtzeitig-sbom.cdx.json` and lists manifests without a lockfile. | CRA Annex I Part II |
| **SEC-SECRETS-001**<br>[`repo/secrets`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/secrets) | critical | No secrets in the repository | Matches tracked files line by line against `data/secrets.yml` and decodes JWTs to find Supabase `service_role` keys. | Art. 32 GDPR |
| **SEC-DEPS-001**<br>[`repo/vulnerabilities`](https://github.com/kreativ-anders/rechtzeitig/tree/main/checks/repo/vulnerabilities) | high | No dependencies with known vulnerabilities | Sends the package URLs of all locked components to the OSV API; high and critical issues in production dependencies fail. | Art. 32 GDPR, CRA Annex I |
<!-- checks:end -->

## Rule ids

| Prefix | Area |
|---|---|
| `LEG-DE` | German law (DDG, BGB, UrhG) |
| `LEG-EU` | EU law (GDPR, ePrivacy as § 25 TDDDG) |
| `SEC` | Security |
| `A11Y` | Accessibility (BFSG) |
| `SUS` | Sustainability |

## Words and languages

Checks look for words like "Impressum", "Datenschutz" or "Alle ablehnen". The words live in one file per language, currently German and English. Pick the language of your site when you start the run; the page language check tells you if the choice looks wrong.

The findings are technical risk hints with the place they were found and the legal basis they relate to. They are not legal advice.
