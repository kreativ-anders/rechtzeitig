# vibecoda

A GitHub Action that checks a website and its repository for German legal basics (DDG, GDPR, TDDDG), security, and writes an SBOM. You start it by hand; it runs on GitHub's free runners.

## Use it

Copy [examples/workflows/vibecoda.yml](examples/workflows/vibecoda.yml) to `.github/workflows/vibecoda.yml`, then open **Actions → vibecoda → Run workflow**.

Documentation: [kreativ-anders.github.io/vibecoda](https://kreativ-anders.github.io/vibecoda/) ([source](docs/)).

## Develop

```sh
npm ci
npx playwright install chromium
node src/main.ts --url https://example.de --repo . --language de
npm run typecheck && npm test
```

How it works and how to add a check: [dev/](dev/).

The results are automated hints, not legal advice.
