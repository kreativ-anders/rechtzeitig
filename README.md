<p align="center">
  <a href="https://rechtzeitig.dev/"><img src=".github/logo.svg" width="72" alt=""></a>
</p>

<h1 align="center">rechtzeitig</h1>

<p align="center">
  <b>GitHub Action that checks your repository and your live website for German and EU legal and security pitfalls. Runs in your own CI, no account.</b>
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

## Quick start

1. Copy [`examples/workflows/rechtzeitig.yml`](examples/workflows/rechtzeitig.yml) to `.github/workflows/rechtzeitig.yml`.
2. Set `url` to your start page.
3. Commit it. The run summary shows the report; after that it runs every Monday.

Inputs, checks, report format and suppressions: [Docs](https://github.com/kreativ-anders/rechtzeitig/wiki).

## Contributing

```sh
npm ci && npx playwright install --only-shell chromium
npm run docs && npm run typecheck && npm test && npm run drift
```

[CONTRIBUTING.md](CONTRIBUTING.md) · [dev/](dev/) · [SECURITY.md](SECURITY.md)

---

Findings are technical risk hints, not legal advice. Licensed under [Apache-2.0](LICENSE); the name rechtzeitig is not covered by the license.
