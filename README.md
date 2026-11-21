<p align="center">
  <a href="https://rechtzeitig.dev/"><img src=".github/logo.svg" width="72" alt=""></a>
</p>

<h1 align="center">rechtzeitig</h1>

<p align="center">
  <b>Finds the legal and security pitfalls that slip into fast or AI-written code, in your repository and on your live website. One GitHub Action in your own CI, one report.</b>
</p>

<p align="center">
  <a href="https://github.com/kreativ-anders/rechtzeitig/releases"><img alt="Release" src="https://img.shields.io/github/v/release/kreativ-anders/rechtzeitig"></a>
  <a href="https://github.com/kreativ-anders/rechtzeitig/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/kreativ-anders/rechtzeitig/actions/workflows/test.yml/badge.svg"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/kreativ-anders/rechtzeitig"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/kreativ-anders/rechtzeitig/badge"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/kreativ-anders/rechtzeitig"></a>
</p>

<p align="center">
  <a href="https://rechtzeitig.dev/">Website</a> ·
  <a href="https://github.com/kreativ-anders/rechtzeitig/wiki/Checks">All checks</a> ·
  <a href="https://github.com/kreativ-anders/rechtzeitig/wiki">Docs</a>
</p>

## Why

More code is written with AI, and the same things keep slipping through: no imprint (Impressum), trackers that load before consent, API keys in the repository, Supabase tables without row level security, missing security headers, outdated packages. rechtzeitig catches them where you already work:

- **Repository and live site.** It reads what visitors never see (lockfiles, workflows, keys, database rules) and what they get (HTML, scripts, cookies, headers, TLS, DNS), and what ships without being visible: the JavaScript bundles and source maps your site serves ([SEC-SECRETS-003](https://github.com/kreativ-anders/rechtzeitig/wiki/Checks-Security#sec-secrets-003), [SEC-EXP-003](https://github.com/kreativ-anders/rechtzeitig/wiki/Checks-Security#sec-exp-003)), in one run and one report. Thirteen checks [compare the two directly](https://github.com/kreativ-anders/rechtzeitig/wiki/Checks) (scope "Repository + website"); they run when the job has both a checkout and a `url`.
- **Continuous.** Run it weekly or on every push, so a new tracker, an expiring certificate or a newly published vulnerability shows up in the next run.
- **Private where it should be.** Private repositories get one line per finding on the run page. Public ones show only counts; the findings go to the Security tab, which only people with write access see, where GitHub allows the upload.
- **Made for machines and coding agents.** Every run writes a [report JSON](https://github.com/kreativ-anders/rechtzeitig/wiki/Report-format) (schema in [`examples/report.schema.json`](examples/report.schema.json)) with message keys, English fix hints and a stable fingerprint per place, and names its path in the output `report`.

## What it checks

| | |
|---|---|
| ⚖️ **Legal** | Imprint, privacy policy, withdrawal, order and cancellation buttons (DDG, BGB) |
| 🍪 **Privacy** | Cookies and trackers before consent, consent banner, third countries (GDPR, TDDDG) |
| 🔒 **Security** | Headers, TLS, exposed files, mixed content, `security.txt` |
| 📦 **Repository** | CycloneDX SBOM, known vulnerabilities, license risks (copyleft, source-available, relicensed, AI models), committed secrets, workflow risks |
| 🌱 **Sustainability and accessibility** | Compression, caching, image formats, page language, autoplay, alt texts, form labels, contrast, ARIA structure and attributes, landmark and live region hints (selected axe-core rules) |

Every check names its legal basis and links a primary source. Your code stays on the runner, there is no account and no paid tier.

## Quick start

1. Copy [`examples/workflows/rechtzeitig.yml`](examples/workflows/rechtzeitig.yml) to `.github/workflows/rechtzeitig.yml`.
2. Set `url` (and `sales`, `subscriptions`) in the file. The site language is detected from the start page.
3. Wait for Monday or open **Actions → rechtzeitig → Run workflow**, then read the report on the run's summary page.

No secret needed. The example runs weekly and fails when a check fails, so GitHub notifies you. Findings also go to the [Security tab](https://github.com/kreativ-anders/rechtzeitig/wiki/Report#security-tab) where GitHub allows it. Optional switches (`sales`, `subscriptions`, `IPINFO_TOKEN`) are listed in [What runs when](https://github.com/kreativ-anders/rechtzeitig/wiki/Inputs#what-runs-when). A rule that does not fit can be [turned off with a reason](https://github.com/kreativ-anders/rechtzeitig/wiki/Suppressions) in `.github/rechtzeitig.yml` (template: [`examples/rechtzeitig.yml`](examples/rechtzeitig.yml)); the report keeps showing it. To get new releases, let Dependabot update the pin: [Keep it running](https://github.com/kreativ-anders/rechtzeitig/wiki/Getting-started#5-keep-it-running).

## Develop

```sh
npm ci
npx playwright install --only-shell chromium
node src/main.ts --url https://example.de --repo .
npm run docs && npm run typecheck && npm test && npm run drift
```

Architecture and how to add a check: [dev/](dev/). Pull requests: [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

---

Findings are technical risk hints, not legal advice. Licensed under [Apache-2.0](LICENSE); the name rechtzeitig is not covered by the license.
