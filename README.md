# vibecoda

A GitHub Action that opens your website like a first-time visitor from Germany would and checks the legal basics: imprint (DDG), privacy policy (GDPR), third-party requests and cookies before consent (TDDDG), the cancellation button (BGB) and a few security and sustainability basics.

It runs only when you start it, on GitHub's free runners.

## Use it

Copy [examples/workflows/vibecoda.yml](examples/workflows/vibecoda.yml) to `.github/workflows/vibecoda.yml` in your repository. Then open **Actions → vibecoda → Run workflow**, enter the URL and pick the language.

The report appears on the run's summary page and as the `vibecoda-report` artifact (Markdown and JSON).

| Input | Default | Meaning |
|---|---|---|
| `url` | | Start page to check |
| `language` | `de` | Language of the site: `de`, `en` or `all` |
| `subscriptions` | `false` | `true` if visitors can sign up for subscriptions. Enables the cancellation button check. |
| `fail-on` | `fail` | When the job turns red, see below |
| `max-pages` | `10` | Pages to visit at most |

### fail-on

Every check ends as `pass`, `warn`, `fail`, `info` or `skip`. `fail-on` decides which of these make the workflow run fail (red ❌). The report is the same in all three cases.

| `fail-on` | Run is red when | Example: 1 fail, 2 warn | Example: 0 fail, 2 warn |
|---|---|---|---|
| `fail` | any check fails | red | green |
| `warn` | any check fails or warns | red | red |
| `never` | never | green | green |

Use `fail` for normal runs. Use `warn` when you want a clean report before a launch. Use `never` if you only want to read the report and don't want a red run.

## What it checks

Each page is loaded twice in a fresh browser, once with JavaScript off and once with it on. Nothing is clicked and no consent is given.

| Check | Looks for | Law |
|---|---|---|
| `legal/imprint` | Imprint linked from the start page, loads, has content | § 5 DDG |
| `legal/imprint-details` | Postal address, email, phone or contact form; VAT ID and register entry if present | § 5 Abs. 1 DDG |
| `legal/privacy-policy` | Privacy policy linked from the start page, loads, has content | Art. 12, 13 GDPR |
| `legal/privacy-policy-details` | Controller, legal basis, storage period, data subject rights, complaint | Art. 13 GDPR |
| `legal/links-on-all-pages` | Both links on every visited page | § 5 DDG, Art. 12 GDPR |
| `legal/cancellation-button` | "Verträge hier kündigen" and a "jetzt kündigen" confirmation | § 312k BGB |
| `privacy/third-parties-before-consent` | Requests to other servers (Google Fonts, analytics, CDNs, embeds) | Art. 6(1) GDPR, § 25 TDDDG |
| `privacy/cookies-before-consent` | Tracking cookies, third-party cookies, local storage | § 25 TDDDG |
| `privacy/vendors-in-privacy-policy` | Every contacted service is named in the privacy policy | Art. 13(1)(e) GDPR |
| `sustainability/legal-pages-without-js` | Imprint and privacy policy work without JavaScript | § 5 DDG |
| `sustainability/content-without-js` | Start page shows its content without JavaScript | |
| `security/https` | HTTPS, and plain HTTP redirects to it | Art. 32 GDPR |
| `security/headers` | HSTS, CSP, nosniff, Referrer-Policy, frame protection | Art. 32 GDPR |
| `accessibility/page-language` | `<html lang>` is set and matches the chosen language | WCAG 3.1.1 |

## Run it locally

```sh
npm ci
npx playwright install chromium
node src/main.ts https://example.de --language de
```

## Add a check

A check is one folder with three things: `check.ts`, `test.ts` and `fixtures/`. See [docs/writing-checks.md](docs/writing-checks.md). How the parts fit together is in [docs/architecture.md](docs/architecture.md).

## Limits

The results are automated hints, not legal advice. GitHub's runners are in US data centers, so a site that shows its consent banner only to EU visitors will look different here. That difference is a finding in itself. Pages behind a login are not checked.
