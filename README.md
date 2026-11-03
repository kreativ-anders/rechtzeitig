# rechtzeitig

A GitHub Action that checks a website and its repository for German legal basics (DDG, GDPR, TDDDG), security, and writes an SBOM. You start it by hand; it runs on GitHub's free runners.

## Use it

Copy [examples/workflows/rechtzeitig.yml](examples/workflows/rechtzeitig.yml) to `.github/workflows/rechtzeitig.yml`, then open **Actions → rechtzeitig → Run workflow**.

Documentation: [kreativ-anders.github.io/rechtzeitig](https://kreativ-anders.github.io/rechtzeitig/) ([source](docs/)).

## Develop

```sh
npm ci
npx playwright install chromium
node src/main.ts --url https://example.de --repo . --language de
npm run typecheck && npm test
```

How it works and how to add a check: [dev/](dev/).

The results are automated hints, not legal advice.

## License

[Apache-2.0](LICENSE). The name rechtzeitig is not covered by the license.
