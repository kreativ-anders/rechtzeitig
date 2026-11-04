<p align="center">
  <a href="https://rechtzeitig.dev/"><img src="docs/favicon.svg" width="72" alt=""></a>
</p>

<h1 align="center">rechtzeitig</h1>

<p align="center">
  <b>German legal basics, security and an SBOM for your website and repository. One GitHub Action, one report.</b>
</p>

<p align="center">
  <a href="https://github.com/kreativ-anders/rechtzeitig/releases"><img alt="Release" src="https://img.shields.io/github/v/release/kreativ-anders/rechtzeitig"></a>
  <a href="https://github.com/kreativ-anders/rechtzeitig/actions/workflows/test.yml"><img alt="Tests" src="https://github.com/kreativ-anders/rechtzeitig/actions/workflows/test.yml/badge.svg"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/kreativ-anders/rechtzeitig"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/kreativ-anders/rechtzeitig/badge"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/kreativ-anders/rechtzeitig"></a>
</p>

<p align="center">
  <a href="https://rechtzeitig.dev/">Website</a> ·
  <a href="https://rechtzeitig.dev/checks.html">All checks</a> ·
  <a href="https://rechtzeitig.dev/workflow.html">Workflow reference</a>
</p>

## What it checks

| | |
|---|---|
| ⚖️ **Legal** | Imprint, privacy policy, withdrawal, order and cancellation buttons (DDG, BGB) |
| 🍪 **Privacy** | Cookies and trackers before consent, consent banner, third countries (GDPR, TDDDG) |
| 🔒 **Security** | Headers, TLS, exposed files, mixed content, `security.txt` |
| 📦 **Repository** | CycloneDX SBOM, known vulnerabilities, license conflicts, committed secrets, workflow risks |
| 🌱 **Sustainability and accessibility** | Compression, caching, image formats, page language, autoplay |

Every check names its legal basis and links a primary source. Your code stays on the runner, there is no account and no paid tier.

## Quick start

1. Copy [`examples/workflows/rechtzeitig.yml`](examples/workflows/rechtzeitig.yml) to `.github/workflows/rechtzeitig.yml`.
2. Open **Actions → rechtzeitig → Run workflow** and enter your URL.
3. Read the report on the run's summary page.

No secret needed. Optional switches (`sales`, `subscriptions`, `sarif-upload`, `IPINFO_TOKEN`) are listed in [What runs when](https://rechtzeitig.dev/workflow.html#scope). To get new releases, let Dependabot update the pin: [How do I get the latest version?](https://rechtzeitig.dev/#updates).

## Develop

```sh
npm ci
npx playwright install --only-shell chromium
node src/main.ts --url https://example.de --repo . --language de
npm run docs && npm run typecheck && npm test && npm run drift
```

Architecture and how to add a check: [dev/](dev/). Pull requests: [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

---

Findings are technical risk hints, not legal advice. Licensed under [Apache-2.0](LICENSE); the name rechtzeitig is not covered by the license.
