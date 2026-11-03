# All checks

Every check ends as `pass`, `warn`, `fail`, `info` or `skip`. `fail` means vibecoda is sure. `warn` means a pattern matched that a person should look at. `info` lists things to judge yourself, and `skip` means the check does not apply.

The severity says how much a finding matters: `critical`, `high`, `medium`, `low` or `info`. Every rule has a fixed id (`LEG-DE-IMP-001`), so you can refer to it in tickets.

Website checks run when you give a URL. Repository checks run when the workflow checks out your repository first. Lockfiles read: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `composer.lock`, `pubspec.lock`, `Cargo.lock`, `uv.lock`, `poetry.lock`, `requirements*.txt`, `go.mod`.

<!-- checks:start -->
### Legal

| Check | Rule | Severity | What it checks | Law |
|---|---|---|---|---|
| `legal/cancellation-button` | LEG-DE-BTN-001 | high | Cancellation button for subscriptions | § 312k BGB (German Civil Code) |
| `legal/form-privacy-notice` | LEG-EU-DSE-003 | medium | Forms link to the privacy policy | Art. 13(1) GDPR |
| `legal/imprint-details` | LEG-DE-IMP-002 | high | Imprint contains the required details | § 5(1) DDG |
| `legal/imprint` | LEG-DE-IMP-001 | high | Imprint is linked and reachable | § 5 DDG (German Digital Services Act) |
| `legal/links-on-all-pages` | LEG-DE-IMP-003 | medium | Imprint and privacy policy are linked on every page | § 5 DDG, Art. 12 GDPR |
| `legal/odr-link` | LEG-EU-ODR-001 | medium | No link to the closed EU dispute platform | Regulation (EU) 2024/3228 |
| `legal/privacy-policy-details` | LEG-EU-DSE-002 | medium | Privacy policy covers the required topics | Art. 13 GDPR |
| `legal/privacy-policy` | LEG-EU-DSE-001 | high | Privacy policy is linked and reachable | Art. 12, 13 GDPR |
| `legal/withdrawal-button` | LEG-DE-BTN-002 | high | Withdrawal button for online contracts | § 356a BGB (German Civil Code, since 19 June 2026) |

### Privacy and consent

| Check | Rule | Severity | What it checks | Law |
|---|---|---|---|---|
| `privacy/consent-preselected` | LEG-EU-CNS-004 | high | Optional cookie categories are not preselected | § 25 TDDDG, ECJ C-673/17 (Planet49) |
| `privacy/consent-reject` | LEG-EU-CNS-003 | high | Consent banner can be rejected on the first layer | § 25 TDDDG, Art. 7(3) GDPR |
| `privacy/cookies-before-consent` | LEG-EU-CNS-002 | high | No cookies before consent | § 25 TDDDG (German Telecommunications Digital Services Data Protection Act) |
| `privacy/third-country` | LEG-EU-DSE-005 | medium | Privacy policy names transfers outside the EU | Art. 13(1)(f), Art. 44 ff. GDPR |
| `privacy/third-parties-before-consent` | LEG-EU-CNS-001 | high | No third-party servers before consent | Art. 6(1) GDPR, § 25 TDDDG |
| `privacy/vendors-in-privacy-policy` | LEG-EU-DSE-004 | medium | Privacy policy names the services the site uses | Art. 13(1)(e) GDPR |

### Security

| Check | Rule | Severity | What it checks | Law |
|---|---|---|---|---|
| `security/cookie-flags` | SEC-HDR-002 | medium | Cookies use secure flags | Art. 32 GDPR |
| `security/email-dns` | SEC-DNS-001 | medium | Domain is protected against email spoofing | Art. 32 GDPR |
| `security/error-disclosure` | SEC-EXP-002 | medium | Error pages reveal no internals | Art. 32 GDPR |
| `security/exposed-files` | SEC-EXP-001 | critical | No private files are public | Art. 32 GDPR |
| `security/headers` | SEC-HDR-001 | low | Security headers are set | Art. 32 GDPR |
| `security/host-variants` | SEC-DNS-002 | low | www and non-www addresses both work | Art. 32 GDPR |
| `security/https` | SEC-TLS-001 | high | Site uses HTTPS | Art. 32 GDPR |
| `security/mixed-content` | SEC-TLS-003 | medium | No unencrypted resources on HTTPS pages | Art. 32 GDPR |
| `security/tls` | SEC-TLS-002 | high | TLS certificate is valid and current | Art. 32 GDPR |

### Sustainability

| Check | Rule | Severity | What it checks | Law |
|---|---|---|---|---|
| `sustainability/content-without-js` | SUS-JS-002 | low | Start page shows content without JavaScript |  |
| `sustainability/legal-pages-without-js` | SUS-JS-001 | medium | Imprint and privacy policy work without JavaScript | § 5 DDG (easily recognizable, directly accessible) |

### Accessibility

| Check | Rule | Severity | What it checks | Law |
|---|---|---|---|---|
| `accessibility/page-language` | A11Y-LANG-001 | low | Page declares its language | WCAG 2.2 success criterion 3.1.1 (BFSG) |

### Repository

| Check | Rule | Severity | What it checks | Law |
|---|---|---|---|---|
| `repo/actions-pinning` | SEC-DEPS-005 | low | GitHub Actions are pinned to a commit | CRA Annex I (supply chain) |
| `repo/database-rules` | SEC-DBAI-001 | critical | Database rules do not open data to everyone | Art. 32 GDPR |
| `repo/dependency-updates` | SEC-DEPS-003 | medium | Dependency updates are automated | CRA Annex I Part II, Art. 32 GDPR |
| `repo/env-files` | SEC-SECRETS-002 | high | .env files stay out of git | Art. 32 GDPR |
| `repo/licenses` | LEG-DE-LIC-001 | medium | Dependency licenses fit the project | §§ 31, 69c UrhG (German Copyright Act) |
| `repo/sbom` | SEC-DEPS-002 | low | Dependencies are locked and listed in an SBOM | CRA Annex I Part II |
| `repo/secrets` | SEC-SECRETS-001 | critical | No secrets in the repository | Art. 32 GDPR |
| `repo/vulnerabilities` | SEC-DEPS-001 | high | No dependencies with known vulnerabilities | Art. 32 GDPR, CRA Annex I |
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
