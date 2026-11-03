# All checks

Every check ends as `pass`, `warn`, `fail`, `info` or `skip`. `fail` means vibecoda is sure. `warn` means a pattern matched that a person should look at. `info` lists things to judge yourself, and `skip` means the check does not apply.

## Website

| Check | Looks for | Law |
|---|---|---|
| `accessibility/page-language` | `<html lang>` is set and matches the chosen language | WCAG 2.2 SC 3.1.1 (BFSG) |
| `legal/cancellation-button` | "Verträge hier kündigen" and a "jetzt kündigen" confirmation | § 312k BGB |
| `legal/form-privacy-notice` | Forms that ask for personal data link to the privacy policy | Art. 13(1) GDPR |
| `legal/imprint` | Imprint linked from the start page, loads, has content | § 5 DDG |
| `legal/imprint-details` | Postal address, email, phone or contact form; VAT ID and register entry if present | § 5 Abs. 1 DDG |
| `legal/links-on-all-pages` | Imprint and privacy policy linked on every visited page | § 5 DDG, Art. 12 GDPR |
| `legal/odr-link` | No link to the EU dispute platform, which closed on 20 July 2025 | Regulation (EU) 2024/3228 |
| `legal/privacy-policy` | Privacy policy linked from the start page, loads, has content | Art. 12, 13 GDPR |
| `legal/privacy-policy-details` | Controller, legal basis, storage period, data subject rights, complaint | Art. 13 GDPR |
| `privacy/consent-preselected` | Statistics and marketing are not ticked in advance | § 25 TDDDG, ECJ C-673/17 |
| `privacy/consent-reject` | A reject button next to the accept button | § 25 TDDDG, Art. 7(3) GDPR |
| `privacy/cookies-before-consent` | Tracking cookies, third-party cookies, local storage | § 25 TDDDG |
| `privacy/third-country` | Services outside the EU/EEA are explained in the privacy policy | Art. 13(1)(f), 44 ff. GDPR |
| `privacy/third-parties-before-consent` | Requests to other servers (Google Fonts, analytics, CDNs, embeds) | Art. 6(1) GDPR, § 25 TDDDG |
| `privacy/vendors-in-privacy-policy` | Every contacted service is named in the privacy policy | Art. 13(1)(e) GDPR |
| `security/cookie-flags` | Secure, HttpOnly and SameSite on cookies | Art. 32 GDPR |
| `security/email-dns` | SPF and DMARC, so nobody can send mail in your name | Art. 32 GDPR |
| `security/error-disclosure` | No stack traces, paths or versions on error pages and in headers | Art. 32 GDPR |
| `security/exposed-files` | `/.env`, `/.git`, SQL dumps, `phpinfo.php` are not public | Art. 32 GDPR |
| `security/headers` | HSTS, CSP, nosniff, Referrer-Policy, frame protection | Art. 32 GDPR |
| `security/host-variants` | `www.` and the bare domain both answer and redirect to one address |  |
| `security/https` | HTTPS, and plain HTTP redirects to it | Art. 32 GDPR |
| `security/mixed-content` | No `http://` resources on HTTPS pages | Art. 32 GDPR |
| `security/tls` | Certificate trusted and not about to expire, TLS 1.2 or newer | Art. 32 GDPR |
| `sustainability/content-without-js` | Start page shows its content without JavaScript |  |
| `sustainability/legal-pages-without-js` | Imprint and privacy policy work without JavaScript | § 5 DDG |

## Repository

These run when the workflow checks out your repository first. Lockfiles read: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `composer.lock`, `pubspec.lock`, `Cargo.lock`, `uv.lock`, `poetry.lock`, `requirements*.txt`, `go.mod`.

| Check | Looks for | Law |
|---|---|---|
| `repo/actions-pinning` | Actions in workflows use a commit SHA, not a movable tag | CRA Annex I |
| `repo/database-rules` | Supabase tables with row level security, no open Firebase rules | Art. 32 GDPR |
| `repo/dependency-updates` | Dependabot or Renovate covers every ecosystem; vulnerability scanners in workflows | CRA Annex I Part II |
| `repo/env-files` | No `.env` committed, `.env` in `.gitignore` | Art. 32 GDPR |
| `repo/licenses` | GPL, AGPL and restrictive licenses that clash with the project license | UrhG §§ 31, 69c |
| `repo/sbom` | Every manifest has a lockfile; writes the CycloneDX SBOM | CRA Annex I Part II |
| `repo/secrets` | API keys, private keys, Supabase `service_role`, secrets under `VITE_`/`NEXT_PUBLIC_` | Art. 32 GDPR |
| `repo/vulnerabilities` | Known vulnerabilities from [OSV](https://osv.dev) in npm, Composer, Pub, Cargo, PyPI and Go | Art. 32 GDPR, CRA Annex I |

## Words and languages

Checks look for words like "Impressum", "Datenschutz" or "Alle ablehnen". The words live in one file per language, currently German and English. Pick the language of your site when you start the run; the page language check tells you if the choice looks wrong.
